import { Request, Response } from 'express';
import sharp from 'sharp';
import { FISRegistry } from '../core/FISRegistry.js';
import { config } from '../config.js';
import { PostRequestSchema } from '../validation/schemas.js';
import { WorkloadPriority } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class FISController {
  
  /**
   * Validates file integrity and resolution.
   * Rejects corrupted files, fake extensions, and oversized resolutions.
   */
  private static async validateMedia(files: Express.Multer.File[]): Promise<{ valid: boolean, error?: string }> {
    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        try {
          const image = sharp(file.buffer);
          const metadata = await image.metadata();
          
          // 1. Check if file is actually a valid image (Detects "fake" extensions like music.jpg)
          if (!metadata.format) {
            return { valid: false, error: `File '${file.originalname}' is not a valid image or is corrupted.` };
          }

          // 2. Resolution Check
          if ((metadata.width && metadata.width > 3000) || (metadata.height && metadata.height > 3000)) {
            return { 
              valid: false, 
              error: `Image resolution ${metadata.width}x${metadata.height} exceeds the 3000x3000px limit.` 
            };
          }
        } catch (e) {
          return { valid: false, error: `File '${file.originalname}' appears to be corrupted or is an unsupported format.` };
        }
      } else if (file.mimetype.startsWith('video/')) {
        // Basic check for video (Note: deep video inspection usually requires ffmpeg)
        if (file.size === 0) return { valid: false, error: `Video file '${file.originalname}' is empty or corrupted.` };
      } else {
        return { valid: false, error: `Unsupported file type: ${file.mimetype}` };
      }
    }
    return { valid: true };
  }

  /**
   * Optimizes images: Strips metadata and applies high-quality compression.
   */
  private static async optimizeMedia(file: Express.Multer.File): Promise<Buffer> {
    if (!file.mimetype.startsWith('image/')) return file.buffer;

    try {
      let pipeline = sharp(file.buffer).rotate(); // Auto-rotate based on EXIF before stripping

      const metadata = await pipeline.metadata();

      if (metadata.format === 'jpeg' || metadata.format === 'png') {
        // Strip metadata and apply high-quality MozJPEG-like compression
        return await pipeline
          .jpeg({ 
            quality: 90, 
            progressive: true, 
            mozjpeg: true 
          })
          .toBuffer();
      }

      // Fallback for other formats: Just strip metadata
      return await pipeline.toBuffer();
    } catch (e) {
      logger.error('Optimization failed, using original buffer', { file: file.originalname });
      return file.buffer;
    }
  }

  private static getFIS(req: Request): { fis: any, error?: string } {
    const pageId = (req.headers['x-platform-id'] || req.headers['x-fb-page-id'] || config.FB_PAGE_ID) as string;
    const token = (req.headers['x-platform-token'] || req.headers['x-fb-token'] || config.FB_PAGE_ACCESS_TOKEN) as string;

    if (!pageId || !token) {
      return { fis: null, error: 'Missing Credentials: Provide x-platform-id/x-platform-token headers or configure defaults.' };
    }

    return { fis: FISRegistry.getInstance(pageId, token) };
  }

  static async createPost(req: Request, res: Response): Promise<void> {
    try {
      const rawBody = req.body;

      if (!rawBody.platform) {
        res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
        return;
      }

      // Platform check
      if (rawBody.platform === 'x') {
        res.status(501).json({ success: false, error: 'Platform X (Twitter) is not yet implemented.' });
        return;
      }

      const { fis, error } = FISController.getFIS(req);
      if (error) {
        res.status(401).json({ success: false, error });
        return;
      }

      const files = req.files as Express.Multer.File[];

      // Validation for Resolution
      if (files && files.length > 0) {
        const validation = await FISController.validateMedia(files);
        if (!validation.valid) {
          res.status(400).json({ success: false, error: validation.error });
          return;
        }
      }
      
      let payload: any = { ...rawBody };
      
      // If the body came as stringified JSON (common with FormData), parse it
      if (typeof rawBody.data === 'string') {
        try {
          const parsed = JSON.parse(rawBody.data);
          payload = { ...parsed, ...payload };
        } catch (e) {
          // ignore
        }
      }

      // Map uploaded files to the media structure expected by FIS
      if (files && files.length > 0) {
        if (!payload.media) payload.media = [];
        
        for (const file of files) {
          const optimizedBuffer = await FISController.optimizeMedia(file);
          payload.media.push({
            source: optimizedBuffer,
            type: file.mimetype.startsWith('video') ? 'video' : 'image',
          });
        }
      }

      // 2. Validate using the Service's Schema
      if (typeof payload.priority === 'string') {
        payload.priority = Number(payload.priority);
      }
      
      if (typeof payload.options === 'string') {
        try {
          payload.options = JSON.parse(payload.options);
        } catch(e) {}
      }

      const result = await fis.post(payload);
      
      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      if (error.errors) {
        // Zod Error
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

      if (!platform) {
        res.status(400).json({ success: false, error: 'Missing required parameter: platform' });
        return;
      }

      if (platform === 'x') {
        res.status(501).json({ success: false, error: 'Platform X (Twitter) is not yet implemented.' });
        return;
      }

      const { fis, error } = FISController.getFIS(req);
      if (error) {
        res.status(401).json({ success: false, error });
        return;
      }

      const { id } = req.params;

      if (!caption) {
        res.status(400).json({ success: false, error: 'Caption is required' });
        return;
      }

      const postId = Array.isArray(id) ? id[0] : id;

      const result = await fis.updatePost(
        postId, 
        caption, 
        priority ? Number(priority) : WorkloadPriority.HIGH,
        dryRun === true || dryRun === 'true'
      );
      
      res.status(result.success ? 200 : 500).json(result);
    } catch (error: any) {
      logger.error('Update Post Error', { error: error.message });
      res.status(500).json({ success: false, error: error.message });
    }
  }

  static getStats(req: Request, res: Response): void {
    res.json(FISRegistry.getGlobalStats());
  }
}