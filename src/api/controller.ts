import { Request, Response } from 'express';
import sharp from 'sharp';
import { z } from 'zod';
import { SocialMediaRegistry } from '../core/SocialMediaRegistry.js';
import { config } from '../config.js';
import { PostRequestSchema } from '../validation/schemas.js';
import { WorkloadPriority } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class SocialMediaController {
  
  /**
   * Validates file integrity and resolution.
   */
  private static async validateMedia(files: Express.Multer.File[]): Promise<{ valid: boolean, error?: string }> {
    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit for images
          return { valid: false, error: `Image '${file.originalname}' exceeds 10MB limit.` };
        }
        try {
          const image = sharp(file.buffer);
          const metadata = await image.metadata();
          if (!metadata.format) return { valid: false, error: `File '${file.originalname}' is not a valid image.` };
          
          // Log a warning for high-res images but allow them to proceed to optimization (auto-resize)
          if ((metadata.width && metadata.width > 3000) || (metadata.height && metadata.height > 3000)) {
            logger.warn('High-resolution image detected, will be auto-resized during optimization', { 
              file: file.originalname, 
              width: metadata.width, 
              height: metadata.height 
            });
          }
        } catch (e) {
          return { valid: false, error: `File '${file.originalname}' is corrupted.` };
        }
      } else if (file.mimetype.startsWith('video/')) {
        if (file.size === 0) return { valid: false, error: `Video file is empty.` };
        if (file.size > 100 * 1024 * 1024) { // 100MB limit for videos
          return { valid: false, error: `Video '${file.originalname}' exceeds 100MB limit.` };
        }
      } else {
        return { valid: false, error: `Unsupported file type: ${file.mimetype}` };
      }
    }
    return { valid: true };
  }

  /**
   * Optimizes images: Strips metadata and applies compression.
   */
  private static async optimizeMedia(file: Express.Multer.File): Promise<Buffer> {
    if (!file.mimetype.startsWith('image/')) return file.buffer;
    try {
      // Automatic Downscaling: Resize to max 3000px if needed while maintaining aspect ratio
      return await sharp(file.buffer)
        .rotate()
        .resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
    } catch (e) {
      return file.buffer;
    }
  }

  private static getService(req: Request, platform: 'fb' | 'x' | 'slack', isDryRun: boolean): { service: any, error?: string } {
    // 1. Try platform-specific headers (e.g., x-fb-id, x-slack-token)
    // 2. Fall back to generic x-platform-* headers
    // 3. Fall back to legacy x-fb-* headers or config defaults
    let pageId = (
      req.headers[`x-${platform}-id`] || 
      req.headers['x-platform-id'] || 
      req.headers['x-fb-page-id'] || 
      (platform === 'fb' ? config.FB_PAGE_ID : undefined)
    ) as string;

    const token = (
      req.headers[`x-${platform}-token`] || 
      req.headers['x-platform-token'] || 
      req.headers['x-fb-token'] || 
      (platform === 'fb' ? config.FB_PAGE_ACCESS_TOKEN : undefined)
    ) as string;

    // Auto-ID: Default to platform name if ID is missing (only for Slack and X)
    if (!pageId && platform !== 'fb') {
      pageId = platform;
    }

    if (!isDryRun && (!pageId || !token)) {
      return { service: null, error: 'Missing Credentials: Provide x-platform-id/x-platform-token headers.' };
    }

    // For dryRun, use 'anonymous' if no ID provided
    return { service: SocialMediaRegistry.getInstance(platform, pageId || 'dry-run-user', token || 'none') };
  }

  static async createFacebookPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processPost(req, res, 'fb');
  }

  static async createTwitterPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processPost(req, res, 'x');
  }

  static async createSlackPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processPost(req, res, 'slack');
  }

  static async createPost(req: Request, res: Response): Promise<void> {
    const platform = req.body.platform as 'fb' | 'x' | 'slack';
    if (!platform) {
      res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
      return;
    }
    return SocialMediaController.processPost(req, res, platform);
  }

  private static async processPost(req: Request, res: Response, platform: 'fb' | 'x' | 'slack'): Promise<void> {
    try {
      const rawBody = req.body;
      
      // Extract dryRun early to allow credential skip
      let options = rawBody.options;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch(e) {}
      }
      const isDryRun = config.DRY_RUN || options?.dryRun === true || options?.dryRun === 'true';

      const { service, error } = SocialMediaController.getService(req, platform, isDryRun);
      if (error) {
        res.status(401).json({ success: false, error });
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (files && files.length > 0) {
        const validation = await SocialMediaController.validateMedia(files);
        if (!validation.valid) {
          res.status(400).json({ success: false, error: validation.error });
          return;
        }
      }
      
      let payload: any = { ...rawBody, platform }; // Ensure platform is set from route/param
      if (typeof rawBody.data === 'string') {
        try {
          const parsed = JSON.parse(rawBody.data);
          payload = { ...parsed, ...payload };
        } catch (e) {}
      }

      if (files && files.length > 0) {
        if (!payload.media || !Array.isArray(payload.media)) {
          payload.media = [];
        }
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const buffer = isDryRun ? file.buffer : await SocialMediaController.optimizeMedia(file);
          const mediaItem = {
            source: buffer,
            type: file.mimetype.startsWith('video') ? 'video' : 'image',
            mimeType: !isDryRun && file.mimetype.startsWith('image/') ? 'image/jpeg' : file.mimetype,
          };

          if (payload.media[i]) {
            payload.media[i] = { ...payload.media[i], ...mediaItem };
          } else {
            payload.media.push(mediaItem);
          }
        }
      }

      if (typeof payload.priority === 'string') payload.priority = Number(payload.priority);
      if (typeof payload.options === 'string') {
        try { payload.options = JSON.parse(payload.options); } catch(e) {}
      }

      // Ensure options.dryRun matches the early-extracted isDryRun
      if (!payload.options) payload.options = {};
      payload.options.dryRun = isDryRun;

      // Validate payload before passing to service
      const validated = PostRequestSchema.parse(payload);

      const result = await service.post(validated);
      res.status(result.success ? 200 : (result.error?.code === 'AUTH_VALIDATION_FAILED' ? 401 : 500)).json(result);
    } catch (error: any) {
      if (error.name === 'ZodError' || error instanceof z.ZodError) {
        logger.error('Validation Error Caught in Controller', { issues: error.issues });
        res.status(400).json({ success: false, error: 'Validation Error', details: error.issues });
      } else if (error.message.includes('Invalid Twitter Credentials')) {
        res.status(401).json({ success: false, error: error.message });
      } else {
        logger.error('API Error', { error: error.message, stack: error.stack });
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  static async updateFacebookPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processUpdate(req, res, 'fb');
  }

  static async updateTwitterPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processUpdate(req, res, 'x');
  }

  static async updateSlackPost(req: Request, res: Response): Promise<void> {
    return SocialMediaController.processUpdate(req, res, 'slack');
  }

  static async updatePost(req: Request, res: Response): Promise<void> {
    const { platform } = req.body;
    if (!platform) {
      res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
      return;
    }
    return SocialMediaController.processUpdate(req, res, platform as any);
  }

  private static async processUpdate(req: Request, res: Response, platform: 'fb' | 'x' | 'slack'): Promise<void> {
    try {
      const { caption, priority, dryRun } = req.body;
      const isDryRun = config.DRY_RUN || dryRun === true || dryRun === 'true';

      const { service, error } = SocialMediaController.getService(req, platform, isDryRun);
      if (error) {
        res.status(401).json({ success: false, error });
        return;
      }

      const { id } = req.params;
      if (!caption) {
        res.status(400).json({ success: false, error: 'Caption is required' });
        return;
      }

      const result = await service.updatePost(
        id, 
        caption, 
        priority ? Number(priority) : WorkloadPriority.HIGH,
        isDryRun
      );
      
      res.status(result.success ? 200 : (result.error?.code === 'AUTH_VALIDATION_FAILED' ? 401 : 500)).json(result);
    } catch (error: any) {
      if (error instanceof z.ZodError || error.name === 'ZodError') {
        logger.error('Validation Error', { issues: error.issues });
        res.status(400).json({ success: false, error: 'Validation Error', details: error.issues });
      } else {
        logger.error('Update Post Error', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  static async getStats(req: Request, res: Response): Promise<void> {
    const stats = await SocialMediaRegistry.getGlobalStats();
    res.json(stats);
  }
}
