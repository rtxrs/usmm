import Redis from 'ioredis';
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
    this.redis.on('error', (err) => logger.error('Redis connection error', { error: err.message }));
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

  // Task management
  async saveTask(task: any) {
    const taskKey = `usmm:task:${task.id}`;
    await this.redis.hset(taskKey, {
      ...task,
      payload: JSON.stringify(task.payload),
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

  async getTaskStats() {
    const taskIds = await this.redis.smembers('usmm:tasks_index');
    const stats: Record<string, number> = {};
    
    for (const id of taskIds) {
      const status = await this.redis.hget(`usmm:task:${id}`, 'status');
      if (status) {
        stats[status] = (stats[status] || 0) + 1;
      }
    }
    
    return stats;
  }
}
