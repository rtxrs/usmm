import { FacebookClient } from './FacebookClient.js';
import { TwitterClient } from './TwitterClient.js';
import { SlackClient } from './SlackClient.js';
import { QueueManager } from './QueueManager.js';
import { PostRequestSchema } from '../validation/schemas.js';
import type { PostRequest } from '../validation/schemas.js';
import { z } from 'zod';
import { WorkloadPriority, FISResponse } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { StreamManager } from './StreamManager.js';
import { config } from '../config.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

export interface ServiceConfig {
  platform: 'fb' | 'x' | 'slack';
  pageId: string;
  accessToken: string;
  concurrency?: number;
  publishRateLimit?: number;
}

type GenericClient = FacebookClient | TwitterClient | SlackClient;

export class SocialMediaService {
  private client: GenericClient | null = null;
  private queue: QueueManager;
  private pageId: string;
  private platform: 'fb' | 'x' | 'slack';
  private config: ServiceConfig;

  constructor(cfg: ServiceConfig) {
    this.pageId = cfg.pageId;
    this.platform = cfg.platform;
    this.config = cfg;
    this.queue = new QueueManager(cfg.concurrency || 3, cfg.publishRateLimit || 10);
    
    logger.info('Social Media Service Initialized', { 
      platform: this.platform,
      pageId: this.pageId, 
      concurrency: cfg.concurrency,
      rateLimit: cfg.publishRateLimit
    });
  }

  private getClient(): GenericClient {
    if (this.client) return this.client;
    
    if (this.platform === 'fb') {
      this.client = new FacebookClient(this.config.pageId, this.config.accessToken);
    } else if (this.platform === 'x') {
      this.client = new TwitterClient(this.config.accessToken);
    } else {
      this.client = new SlackClient(this.config.accessToken);
    }
    return this.client;
  }

  private async ensureLogoCached() {
    const filePath = path.join(process.cwd(), 'public', 'cache', 'logos', `${this.platform}_${this.pageId}.jpg`);
    if (fs.existsSync(filePath)) return;

    try {
      // Create cache dir if it doesn't exist
      const cacheDir = path.dirname(filePath);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

      const url = await this.getClient().getProfilePicUrl();
      const response = await axios.get(url, { responseType: 'arraybuffer', proxy: false });
      fs.writeFileSync(filePath, response.data);
      logger.debug('Cached profile picture', { platform: this.platform, pageId: this.pageId });
    } catch (e: any) {
      logger.warn('Failed to cache profile picture', { error: e.message, pageId: this.pageId });
    }
  }

  async post(request: PostRequest, existingRequestId?: string): Promise<FISResponse> {
    const validated = request;
    const isDryRun = config.DRY_RUN || validated.options?.dryRun;
    const processedCaption = validated.caption ? this.ensureRobustCaption(validated.caption) : '';
    const requestId = existingRequestId || `req_${Math.random().toString(36).substr(2, 9)}`;

    StreamManager.emitQueueUpdate(this.platform, this.pageId, 'queued', { 
      priority: validated.priority,
      isDryRun,
      requestId
    });

    // Persist all tasks to Redis for monitoring (even dry runs)
    this.ensureLogoCached(); // Fire and forget
    await this.queue.addPersistentTask(requestId, this.platform, this.pageId, validated, validated.priority, isDryRun);

    return this.queue.add(async () => {
      const targets = [];
      if (validated.options?.publishToFeed !== false) targets.push('FEED');
      if (validated.options?.publishToStory) targets.push('STORY');

      StreamManager.emitQueueUpdate(this.platform, this.pageId, 'processing', { 
        task: isDryRun ? `[DRY RUN] Simulating ${targets.join('+')}...` : `Starting ${targets.join('+')} Upload`,
        isDryRun,
        requestId
      });
      
      logger.debug('Executing task from priority queue', { 
        requestId, 
        priority: validated.priority, 
        targets,
        dryRun: isDryRun 
      });
      
      if (isDryRun) {
        // Refined Dry Run: Validate credentials before simulating
        const validation = await this.getClient().validateToken(validated.options?.validateToken);
        if (!validation.valid) {
          const error = { 
            code: 'AUTH_VALIDATION_FAILED', 
            message: `Dry Run Auth Check Failed: ${validation.error || 'Invalid credentials'}` 
          };
          StreamManager.emitQueueUpdate(this.platform, this.pageId, 'failed', { ...error, isDryRun, requestId });
          return { success: false, error, timestamp: new Date().toISOString() };
        }

        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockResult = {
          success: true,
          postId: `DRY_RUN_${Math.random().toString(36).substring(7)}`,
          timestamp: new Date().toISOString(),
          dryRunMetadata: {
            accountName: (validation as any).name || 'Mock Account',
            validatedAt: new Date().toISOString()
          }
        };
        StreamManager.emitQueueUpdate(this.platform, this.pageId, 'completed', { ...mockResult, isDryRun, requestId });
        return mockResult;
      }

      try {
        let mediaIds: string[] = [];

        let fallbackToTextOnly = false;
        let fallbackReason = '';
        
        if (validated.media && validated.media.length > 0) {
          try {
            mediaIds = await Promise.all(
              validated.media.map((m, idx) => {
                const fallbackAlt = `${this.pageId}_${Math.floor(Date.now() / 1000)}_${idx}`;
                return this.getClient().uploadMedia({
                  source: m.source,
                  type: m.type,
                  altText: m.altText || processedCaption || fallbackAlt
                });
              })
            );
            logger.debug('Media uploaded successfully', { requestId, count: mediaIds.length });
          } catch (uploadError: any) {
            fallbackToTextOnly = true;
            fallbackReason = uploadError.message || 'Media upload failed';
            logger.error('Media upload failed, falling back to text-only', { requestId, error: fallbackReason });
          }
        }

        const results: FISResponse[] = [];

        if (validated.options?.publishToFeed !== false) {
          const mediaObjects = mediaIds.map((id, idx) => ({ 
            id, 
            type: validated.media?.[idx]?.type || 'image' 
          }));
          const res = await this.getClient().createFeedPost(processedCaption, mediaObjects, validated.options);
          results.push(res);
          if (res.success) {
            logger.info('Post published successfully', { 
              platform: this.platform,
              requestId, 
              postId: res.postId, 
              priority: validated.priority,
              pageId: this.pageId 
            });
          }
        }

        if (validated.options?.publishToStory && mediaIds.length > 0) {
          const firstMediaId = mediaIds[0];
          const firstMediaType = validated.media?.[0]?.type || 'image';
          if (firstMediaId) {
            const res = await this.getClient().createStory(firstMediaId, firstMediaType);
            results.push(res);
            if (res.success) {
              logger.info('Story published successfully', { 
                platform: this.platform,
                requestId, 
                mediaId: firstMediaId, 
                priority: validated.priority,
                pageId: this.pageId 
              });
            }
          }
        }

        const finalResult: FISResponse = results[0] || { 
          success: false, 
          error: { code: 'NO_ACTION', message: 'No publish targets selected' },
          timestamp: new Date().toISOString()
        };
        
        // Add fallback indication if media upload failed
        if (fallbackToTextOnly) {
          finalResult.fallbackToTextOnly = true;
          finalResult.fallbackReason = fallbackReason;
        }

        StreamManager.emitQueueUpdate(this.platform, this.pageId, finalResult.success ? 'completed' : 'failed', { 
          postId: finalResult.postId,
          error: finalResult.error,
          requestId
        });

        return finalResult;

      } catch (error: any) {
        logger.error('Post execution error', { requestId, error: error.message });
        StreamManager.emitQueueUpdate(this.platform, this.pageId, 'failed', { error: error.message, requestId });
        
        return {
          success: false,
          error: { code: 'EXECUTION_ERROR', message: error.message },
          timestamp: new Date().toISOString()
        };
      }
    }, validated.priority, true, isDryRun, requestId);
  }

  async updatePost(postId: string, newCaption: string, priority: WorkloadPriority = WorkloadPriority.HIGH, dryRun: boolean = false, existingRequestId?: string): Promise<FISResponse> {
    const isDryRun = config.DRY_RUN || dryRun;
    const requestId = existingRequestId || `upd_${Math.random().toString(36).substr(2, 9)}`;
    logger.info('Queuing authoritative update', { requestId, postId, dryRun: isDryRun });
    StreamManager.emitQueueUpdate(this.platform, this.pageId, 'queued', { type: 'update', postId, isDryRun, requestId });
    
    this.ensureLogoCached();
    await this.queue.addPersistentTask(requestId, this.platform, this.pageId, { action: 'update', postId, newCaption }, priority, isDryRun);

    return this.queue.add(async () => {
      StreamManager.emitQueueUpdate(this.platform, this.pageId, 'processing', { 
        task: isDryRun ? '[DRY RUN] Updating...' : 'Updating Post',
        isDryRun,
        requestId
      });
      
      if (isDryRun) {
        const validation = await this.getClient().validateToken();
        if (!validation.valid) {
          const error = { code: 'AUTH_VALIDATION_FAILED', message: `Dry Run Auth Check Failed: ${validation.error || 'Invalid credentials'}` };
          StreamManager.emitQueueUpdate(this.platform, this.pageId, 'failed', { ...error, isDryRun, requestId });
          return { success: false, error, timestamp: new Date().toISOString() };
        }
        
        await new Promise(resolve => setTimeout(resolve, 800));
        const mockResult = { success: true, postId, timestamp: new Date().toISOString() };
        StreamManager.emitQueueUpdate(this.platform, this.pageId, 'completed', { ...mockResult, isDryRun, requestId });
        return mockResult;
      }

      const result = await this.getClient().updatePost(postId, newCaption);
      StreamManager.emitQueueUpdate(this.platform, this.pageId, result.success ? 'completed' : 'failed', { postId, requestId });
      return result;
    }, priority, false, isDryRun, requestId);
  }

  private ensureRobustCaption(caption?: string): string {
    if (!caption || caption.length < 50) {
      return caption || '⚠️ Standard Advisory: Please check the official portal for more details.';
    }
    return caption;
  }

  async getStats() {
    return await this.queue.getStats();
  }

  // Improved error handling to surface Facebook API errors
  async getFacebookErrorDetails(error: any): Promise<{ code: string; message: string }> {
    const errorData = error.response?.data;
    const statusCode = error.response?.status;
    const errorCode = errorData?.error?.code;
    const errorMessage = errorData?.error?.message || error.message;

    // Map Facebook error codes to meaningful error types
    if (statusCode === 401 || errorCode === 'OAuthException') {
      return { code: 'FACEBOOK_OAUTH_ERROR', message: errorMessage };
    }
    if (errorCode === 1 || statusCode === 500) {
      return { code: 'FACEBOOK_UNKNOWN_ERROR', message: errorMessage };
    }
    if (statusCode === 403) {
      return { code: 'FACEBOOK_PERMISSION_ERROR', message: errorMessage };
    }
    if (statusCode === 429) {
      return { code: 'FACEBOOK_RATE_LIMIT', message: errorMessage };
    }
    return { code: 'FACEBOOK_API_ERROR', message: errorMessage };
  }

  async validateToken(forceRealCheck: boolean = false) {
    return await this.getClient().validateToken(forceRealCheck);
  }

  async recoverTasks(pendingTasks: any[]) {
    const myTasks = pendingTasks.filter(t => t.platform === this.platform && t.page_id === this.pageId);
    if (myTasks.length === 0) return;

    logger.info(`Recovering ${myTasks.length} tasks for ${this.platform}:${this.pageId}`);

    for (const task of myTasks) {
      // Re-queue the task using its original ID to prevent duplication in Redis
      if (task.payload.action === 'update') {
         this.updatePost(task.payload.postId, task.payload.newCaption, Number(task.priority), task.is_dry_run, task.id);
      } else {
         this.post(task.payload, task.id);
      }
    }
  }

  get stats() {
    return this.getStats();
  }
}
