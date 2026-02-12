import { z } from 'zod';
import { WorkloadPriority } from '../types/index.js';

export const MediaSchema = z.object({
  source: z.union([z.instanceof(Buffer), z.string()]),
  type: z.enum(['image', 'video']),
  mimeType: z.string().optional(),
  altText: z.string().optional(),
});

export const PostRequestSchema = z.object({
  platform: z.enum(['fb', 'x']),
  caption: z.string().optional(),
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
}).refine(data => {
  if (data.options?.publishToFeed !== false && !data.caption) {
    return false;
  }
  return true;
}, {
  message: "Caption is required for feed posts",
  path: ["caption"]
});

export type PostRequest = z.infer<typeof PostRequestSchema>;