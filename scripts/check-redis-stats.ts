import { Redis } from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

async function checkRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  try {
    const taskIds = await redis.smembers('usmm:tasks_index');
    console.log(`Total tasks in index: ${taskIds.length}`);

    const statuses: Record<string, number> = {};
    const taskDetails: any[] = [];

    for (const id of taskIds) {
      const task = await redis.hgetall(`usmm:task:${id}`);
      if (task) {
        statuses[task.status] = (statuses[task.status] || 0) + 1;
        if (task.status !== 'completed' && task.status !== 'failed') {
          taskDetails.push({ id, status: task.status, platform: task.platform, created_at: task.created_at });
        }
      } else {
        console.log(`Task ${id} found in index but hash is missing!`);
      }
    }

    console.log('Task Statuses:', statuses);
    if (taskDetails.length > 0) {
      console.log('Non-final tasks:', taskDetails);
    }

    const keys = await redis.keys('usmm:*');
    console.log(`Total USMM keys: ${keys.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    redis.disconnect();
  }
}

checkRedis();
