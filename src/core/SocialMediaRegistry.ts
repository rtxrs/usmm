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
        try {
          const stmt = this.db.prepare(`
            INSERT INTO accounts (platform, platform_id, access_token)
            VALUES (?, ?, ?)
            ON CONFLICT(platform, platform_id) DO UPDATE SET access_token = EXCLUDED.access_token
          `);
          stmt.run(platform, pageId, accessToken);
        } catch (e: any) {
          logger.warn('Failed to persist account to DB', { error: e.message });
        }
      }
    }
    
    return this.instances.get(key)!;
  }

  /**
   * Returns stats for all active instances.
   */
  static getGlobalStats() {
    return {
      dryRun: config.DRY_RUN,
      instances: Object.fromEntries(
        Array.from(this.instances.entries()).map(([id, service]) => [id, service.stats])
      )
    };
  }
}