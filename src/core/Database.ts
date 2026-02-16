import { Redis } from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export class Database {
  private static instance: Database;
  private redis: Redis;

  private constructor() {
    const options: any = {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD,
      retryStrategy: (times: number) => Math.min(times * 50, 2000),
    };

    if (config.REDIS_URL) {
      this.redis = new Redis(config.REDIS_URL, options);
    } else {
      this.redis = new Redis(options);
    }

    this.redis.on('connect', () => logger.info('Connected to Redis'));
    this.redis.on('error', (err: Error) => logger.error('Redis connection error', { error: err.message }));
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public get client(): Redis {
    return this.redis;
  }

  // Account management
  async saveAccount(platform: string, platformId: string, accessToken: string, metadata: any) {
    const key = `usmm:account:${platform}:${platformId}`;
    await this.redis.hset(key, {
      platform,
      platform_id: platformId,
      access_token: accessToken,
      metadata: JSON.stringify(metadata),
      updated_at: new Date().toISOString()
    });
  }

  async getAccount(platform: string, platformId: string) {
    const key = `usmm:account:${platform}:${platformId}`;
    return await this.redis.hgetall(key);
  }

  /**
   * Extends the life of an account record by 1 day (86400 seconds).
   * Records not accessed for 24 hours will be automatically removed from Redis.
   */
  async extendAccountSession(platform: string, platformId: string) {
    const key = `usmm:account:${platform}:${platformId}`;
    await this.redis.expire(key, 86400);
  }

  // Task management
  async saveTask(task: any) {
    const taskKey = `usmm:task:${task.id}`;
    await this.redis.hset(taskKey, {
      ...task,
      payload: JSON.stringify(task.payload),
      is_dry_run: task.is_dry_run ? 'true' : 'false',
      created_at: task.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    // Add to a global task index (set) for easier retrieval/stats
    await this.redis.sadd('usmm:tasks_index', task.id);
  }

  async updateTaskStatus(id: string, status: string, errorLog?: string) {
    const taskKey = `usmm:task:${id}`;
    await this.redis.hset(taskKey, {
      status,
      error_log: errorLog || '',
      updated_at: new Date().toISOString()
    });
  }

  async deleteTask(id: string) {
    await this.redis.del(`usmm:task:${id}`);
    await this.redis.srem('usmm:tasks_index', id);
  }

  async getPendingTasks() {
    const taskIds = await this.redis.smembers('usmm:tasks_index');
    const pendingTasks: any[] = [];
    
    for (const id of taskIds) {
      const task = await this.redis.hgetall(`usmm:task:${id}`);
      if (task && task.status === 'pending') {
        try {
          const processedTask = {
            ...task,
            payload: JSON.parse(task.payload),
            is_dry_run: task.is_dry_run === 'true'
          };
          pendingTasks.push(processedTask);
        } catch (e: any) {
          logger.error(`Failed to parse task payload for ${id}`, { error: e.message });
        }
      } else if (!task) {
        await this.redis.srem('usmm:tasks_index', id);
      }
    }
    
    return pendingTasks;
  }

  async getTaskStats() {
    const taskIds = await this.redis.smembers('usmm:tasks_index');
    const stats: Record<string, number> = {};
    
    for (const id of taskIds) {
      const status = await this.redis.hget(`usmm:task:${id}`, 'status');
      if (status) {
        stats[status] = (stats[status] || 0) + 1;
      } else {
        // Task has expired or been deleted, remove from index
        await this.redis.srem('usmm:tasks_index', id);
      }
    }
    
    return stats;
  }
}
