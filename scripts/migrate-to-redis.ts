import DatabaseConstructor from 'better-sqlite3';
import { Redis } from 'ioredis';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load default .env
dotenv.config();

// Only load .env.local for development/local environments
if (process.env.NODE_ENV !== 'production') {
  if (fs.existsSync('.env.local')) {
    const localConfig = dotenv.parse(fs.readFileSync('.env.local'));
    for (const k in localConfig) {
      process.env[k] = localConfig[k];
    }
  }
}

async function migrate() {
  const dbPath = path.join(process.cwd(), 'usmm.db');
  if (!fs.existsSync(dbPath)) {
    console.log('No usmm.db found, skipping data migration.');
    return;
  }

  console.log('Starting migration from SQLite to Redis...');
  const sqlite = new DatabaseConstructor(dbPath);
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  });

  // Migrate Accounts
  console.log('Migrating accounts...');
  const accounts = sqlite.prepare('SELECT * FROM accounts').all();
  for (const account: any of accounts) {
    const key = `usmm:account:${account.platform}:${account.platform_id}`;
    await redis.hset(key, {
      platform: account.platform,
      platform_id: account.platform_id,
      access_token: account.access_token,
      metadata: account.metadata || '{}',
      updated_at: account.created_at
    });
    console.log(`  Migrated account: ${account.platform}:${account.platform_id}`);
  }

  // Migrate Tasks
  console.log('Migrating tasks...');
  const tasks = sqlite.prepare('SELECT * FROM tasks').all();
  for (const task: any of tasks) {
    const taskKey = `usmm:task:${task.id}`;
    await redis.hset(taskKey, {
      id: task.id,
      platform: task.platform,
      page_id: task.page_id,
      payload: task.payload,
      priority: task.priority,
      status: task.status,
      error_log: task.error_log || '',
      created_at: task.created_at,
      updated_at: task.updated_at
    });
    await redis.sadd('usmm:tasks_index', task.id);
    console.log(`  Migrated task: ${task.id}`);
  }

  console.log('Migration completed successfully!');
  await redis.quit();
  sqlite.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
