import { z } from 'zod';
import { WorkloadPriority } from '../types/index.js';

export const MediaSchema = z.object({
  source: z.union([z.instanceof(Buffer), z.string()]),
  type: z.enum(['image', 'video']),
  altText: z.string().optional(),
});

export const PostRequestSchema = z.object({
  platform: z.enum(['fb', 'x']),
  caption: z.string().min(1),
  media: z.array(MediaSchema).optional(),
  priority: z.nativeEnum(WorkloadPriority).default(WorkloadPriority.NORMAL),
  options: z.object({
    publishToFeed: z.boolean().default(true),
    publishToStory: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    retryConfig: z.object({
      maxRetries: z.number().default(3),
      backoffMs: z.number().default(1000),
    }).optional(),
  }).optional(),
});

export type PostRequest = z.infer<typeof PostRequestSchema>;