import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// Load .env.local if it exists, otherwise fallback to .env
if (fs.existsSync(path.join(process.cwd(), '.env.local'))) {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
} else {
  dotenv.config();
}

const EnvSchema = z.object({
  PORT: z.string().default('3005'),
  FB_PAGE_ID: z.string().optional(),
  FB_PAGE_ACCESS_TOKEN: z.string().optional(),
  CONCURRENCY: z.string().default('3').transform(Number),
  GLOBAL_CONCURRENCY: z.string().default('100').transform(Number),
  PUBLISH_RATE_LIMIT: z.string().default('10').transform(Number),
  DRY_RUN: z.string().default('false').transform((v) => v === 'true'),
  API_KEY: z.string().optional(), // Optional simple auth
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform(Number),
  REDIS_PASSWORD: z.string().optional(),
});

const processEnv = EnvSchema.safeParse(process.env);

if (!processEnv.success) {
  console.error("❌ Invalid environment variables:", processEnv.error.format());
  process.exit(1);
}

export const config = processEnv.data;
