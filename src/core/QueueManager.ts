import PQueue from 'p-queue';
import { WorkloadPriority } from '../types/index.js';
import { config } from '../config.js';
import { Database } from './Database.js';

export class QueueManager {
  private static globalGeneralQueue = new PQueue({ concurrency: config.GLOBAL_CONCURRENCY || 100 });
  
  private publishQueue: PQueue;
  private db = Database.getInstance();

  constructor(concurrency: number = 3, publishRateLimit: number = 10) {
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
    priority: number,
    isDryRun: boolean = false
  ) {
    await this.db.saveTask({
      id,
      platform,
      page_id: pageId,
      payload,
      priority,
      status: 'pending',
      is_dry_run: isDryRun
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
    const targetQueue = isPublishingTask ? this.publishQueue : QueueManager.globalGeneralQueue;
    
    // Prioritization: Penalize dry runs so they always fall below real requests.
    // Real priorities: 10, 5, 0. Dry run priorities: -90, -95, -100.
    const effectivePriority = isDryRun ? priority - 100 : priority;
    
    if (persistentId) {
      await this.updateTaskStatus(persistentId, 'processing');
    }

    try {
      const result = await targetQueue.add(task, { priority: effectivePriority });
      if (persistentId) {
        // Task completed successfully: remove it immediately to protect privacy/security
        await this.db.deleteTask(persistentId);
      }
      return result;
    } catch (error: any) {
      if (persistentId) {
        // Task failed: update status and set a short TTL (1 hour) for debugging before auto-deletion
        await this.updateTaskStatus(persistentId, 'failed', error.message);
        await this.db.client.expire(`usmm:task:${persistentId}`, 3600);
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
