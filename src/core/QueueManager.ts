import PQueue from 'p-queue';
import { WorkloadPriority } from '../types/index.js';
import { config } from '../config.js';
import { Database } from './Database.js';

export class QueueManager {
  private static globalGeneralQueue = new PQueue({ concurrency: config.GLOBAL_CONCURRENCY || 100 });
  
  private queue: PQueue;
  private publishQueue: PQueue;
  private db = Database.getInstance();

  constructor(concurrency: number = 3, publishRateLimit: number = 10) {
    this.queue = new PQueue({ concurrency });
    this.publishQueue = new PQueue({
      concurrency: 1, 
      intervalCap: publishRateLimit,
      interval: 60000, 
      carryoverConcurrencyCount: true
    });
  }

  async addPersistentTask(
    id: string,
    platform: string,
    pageId: string,
    payload: any,
    priority: number
  ) {
    await this.db.saveTask({
      id,
      platform,
      page_id: pageId,
      payload,
      priority,
      status: 'pending'
    });
  }

  async updateTaskStatus(id: string, status: string, error?: string) {
    await this.db.updateTaskStatus(id, status, error);
  }

  async add<T>(
    task: () => Promise<T>,
    priority: WorkloadPriority = WorkloadPriority.NORMAL,
    isPublishingTask: boolean = false,
    isDryRun: boolean = false,
    persistentId?: string
  ): Promise<T> {
    if (isDryRun) {
      return task();
    }
    
    const targetQueue = isPublishingTask ? this.publishQueue : QueueManager.globalGeneralQueue;
    
    if (persistentId) {
      await this.updateTaskStatus(persistentId, 'processing');
    }

    try {
      const result = await targetQueue.add(task, { priority });
      if (persistentId) {
        await this.updateTaskStatus(persistentId, 'completed');
      }
      return result;
    } catch (error: any) {
      if (persistentId) {
        await this.updateTaskStatus(persistentId, 'failed', error.message);
      }
      throw error;
    }
  }

  async getStats() {
    const dbStats = await this.db.getTaskStats();
    return {
      db: dbStats,
      queues: {
        general: {
          size: QueueManager.globalGeneralQueue.size,
          pending: QueueManager.globalGeneralQueue.pending,
        },
        publish: {
          size: this.publishQueue.size,
          pending: this.publishQueue.pending,
        }
      }
    };
  }

  // Legacy getter for compatibility if needed during transition, 
  // but it's better to use getStats()
  get stats() {
    return {
      error: "Use async getStats() instead",
      queues: {
        general: {
          size: QueueManager.globalGeneralQueue.size,
          pending: QueueManager.globalGeneralQueue.pending,
        }
      }
    };
  }
}
