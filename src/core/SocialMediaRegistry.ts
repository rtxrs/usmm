import { SocialMediaService } from './SocialMediaService.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Database } from './Database.js';

export class SocialMediaRegistry {
  private static instances: Map<string, SocialMediaService> = new Map();
  private static db = Database.getInstance();

  static getInstance(platform: 'fb' | 'x' | 'slack', pageId: string, accessToken: string): SocialMediaService {
    const key = `${platform}:${pageId}:${accessToken}`;
    
    if (!this.instances.has(key)) {
      logger.info('Creating new service instance', { platform, pageId });
      
      const instance = new SocialMediaService({
        platform,
        pageId,
        accessToken,
        concurrency: config.CONCURRENCY,
        publishRateLimit: config.PUBLISH_RATE_LIMIT
      });

      this.instances.set(key, instance);

      // Persist account if not dry-run anonymous
      if (pageId !== 'dry-run-user' && pageId !== 'anonymous' && accessToken !== 'none') {
        this.db.saveAccount(platform, pageId, accessToken, {}).catch(e => {
          logger.warn('Failed to persist account to Redis', { error: e.message });
        });
      }
    }
    
    return this.instances.get(key)!;
  }

  /**
   * Returns stats for all active instances.
   */
  static async getGlobalStats() {
    const instanceStats = await Promise.all(
      Array.from(this.instances.entries()).map(async ([id, service]) => {
        const stats = await service.stats;
        return [id, stats];
      })
    );

    return {
      dryRun: config.DRY_RUN,
      instances: Object.fromEntries(instanceStats)
    };
  }
}
