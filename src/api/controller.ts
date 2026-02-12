import { Request, Response } from 'express';
import sharp from 'sharp';
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
        try {
          const image = sharp(file.buffer);
          const metadata = await image.metadata();
          if (!metadata.format) return { valid: false, error: `File '${file.originalname}' is not a valid image.` };
          if ((metadata.width && metadata.width > 3000) || (metadata.height && metadata.height > 3000)) {
            return { valid: false, error: `Image resolution exceeds 3000x3000px limit.` };
          }
        } catch (e) {
          return { valid: false, error: `File '${file.originalname}' is corrupted.` };
        }
      } else if (file.mimetype.startsWith('video/')) {
        if (file.size === 0) return { valid: false, error: `Video file is empty.` };
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
      return await sharp(file.buffer).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    } catch (e) {
      return file.buffer;
    }
  }

  private static getService(req: Request, platform: 'fb' | 'x', isDryRun: boolean): { service: any, error?: string } {
    const pageId = (req.headers['x-platform-id'] || req.headers['x-fb-page-id'] || config.FB_PAGE_ID) as string;
    const token = (req.headers['x-platform-token'] || req.headers['x-fb-token'] || config.FB_PAGE_ACCESS_TOKEN) as string;

    if (!isDryRun && (!pageId || !token)) {
      return { service: null, error: 'Missing Credentials: Provide x-platform-id/x-platform-token headers.' };
    }

    // For dryRun, use 'anonymous' if no ID provided
    return { service: SocialMediaRegistry.getInstance(platform, pageId || 'dry-run-user', token || 'none') };
  }

  static async createPost(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = req.body;
      const platform = rawBody.platform as 'fb' | 'x';
      
      // Extract dryRun early to allow credential skip
      let options = rawBody.options;
      if (typeof options === 'string') {
        try { options = JSON.parse(options); } catch(e) {}
      }
      const isDryRun = config.DRY_RUN || options?.dryRun === true || options?.dryRun === 'true';

      if (!platform) {
        res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
        return;
      }

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
      
      let payload: any = { ...rawBody };
      if (typeof rawBody.data === 'string') {
        try {
          const parsed = JSON.parse(rawBody.data);
          payload = { ...parsed, ...payload };
        } catch (e) {}
      }

      if (files && files.length > 0) {
        if (!payload.media) payload.media = [];
        for (const file of files) {
          const buffer = isDryRun ? file.buffer : await SocialMediaController.optimizeMedia(file);
          payload.media.push({
            source: buffer,
            type: file.mimetype.startsWith('video') ? 'video' : 'image',
            mimeType: !isDryRun && file.mimetype.startsWith('image/') ? 'image/jpeg' : file.mimetype,
          });
        }
      }

      if (typeof payload.priority === 'string') payload.priority = Number(payload.priority);
      if (typeof payload.options === 'string') {
        try { payload.options = JSON.parse(payload.options); } catch(e) {}
      }

      const result = await service.post(payload);
      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      if (error.errors) {
        // Zod validation error
        logger.error('Validation Error', { details: error.errors });
        res.status(400).json({ success: false, error: 'Validation Error', details: error.errors });
      } else {
        logger.error('API Error', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  static async updatePost(req: Request, res: Response): Promise<void> {
    try {
      const { platform, caption, priority, dryRun } = req.body;
      const isDryRun = config.DRY_RUN || dryRun === true || dryRun === 'true';

      if (!platform) {
        res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
        return;
      }

      const { service, error } = SocialMediaController.getService(req, platform as 'fb' | 'x', isDryRun);
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
        dryRun === true || dryRun === 'true'
      );
      
      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      if (error.errors) {
        logger.error('Validation Error', { details: error.errors });
        res.status(400).json({ success: false, error: 'Validation Error', details: error.errors });
      } else {
        logger.error('Update Post Error', { error: error.message });
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  static getStats(req: Request, res: Response): void {
    res.json(SocialMediaRegistry.getGlobalStats());
  }
}
