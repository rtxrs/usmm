import { SocialMediaService } from './SocialMediaService.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { Database } from './Database.js';

export class SocialMediaRegistry {
  private static instances: Map<string, SocialMediaService> = new Map();
  private static db = Database.getInstance();
  private static pendingTasksCache: any[] | null = null;

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

      // Trigger recovery for this instance if we have cached pending tasks
      if (this.pendingTasksCache) {
        instance.recoverTasks(this.pendingTasksCache).catch(err => {
          logger.error('Task recovery failed for instance', { platform, pageId, error: err.message });
        });
      }

      // Persist account if not dry-run anonymous
      if (pageId !== 'dry-run-user' && pageId !== 'anonymous' && accessToken !== 'none') {
        this.db.saveAccount(platform, pageId, accessToken, {}).then(() => {
          return this.db.extendAccountSession(platform, pageId);
        }).catch(e => {
          logger.warn('Failed to persist/expire account in Redis', { error: e.message });
        });
      }
    } else {
      // If instance exists, still extend the session in Redis to keep it alive for another day
      if (pageId !== 'dry-run-user' && pageId !== 'anonymous') {
        this.db.extendAccountSession(platform, pageId).catch(() => {});
      }
    }
    
    return this.instances.get(key)!;
  }

  /**
   * Loads all pending tasks from DB and instantiates services for them.
   */
  static async recoverAllPendingTasks() {
    try {
      const pendingTasks = await this.db.getPendingTasks();
      if (pendingTasks.length === 0) return;

      this.pendingTasksCache = pendingTasks;
      logger.info(`System Recovery: Found ${pendingTasks.length} pending tasks in Redis.`);

      // Group by account to avoid multiple calls for same credentials
      const accounts = new Map<string, { platform: any, pageId: string, token: string }>();
      
      for (const task of pendingTasks) {
        // We only have pageId in task, but SocialMediaRegistry needs the token to create an instance.
        // Try to get account token from DB
        const account = await this.db.getAccount(task.platform, task.page_id);
        if (account && account.access_token) {
          const accKey = `${task.platform}:${task.page_id}`;
          if (!accounts.has(accKey)) {
            accounts.set(accKey, { 
              platform: task.platform, 
              pageId: task.page_id, 
              token: account.access_token 
            });
          }
        } else {
          logger.warn(`Cannot recover task ${task.id}: No stored credentials for ${task.platform}:${task.page_id}`);
        }
      }

      // Instantiate services (this triggers instance.recoverTasks because pendingTasksCache is set)
      for (const acc of accounts.values()) {
        this.getInstance(acc.platform, acc.pageId, acc.token);
      }
      
      // Clear cache after small delay to ensure all triggered getInstance calls are done
      setTimeout(() => { this.pendingTasksCache = null; }, 5000);

    } catch (err: any) {
      logger.error('Global task recovery failed', { error: err.message });
    }
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
