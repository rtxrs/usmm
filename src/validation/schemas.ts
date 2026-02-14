import { z } from 'zod';
import { WorkloadPriority } from '../types/index.js';

export const MediaSchema = z.object({
  source: z.union([z.instanceof(Buffer), z.string()]),
  type: z.enum(['image', 'video']),
  mimeType: z.string().optional(),
  altText: z.string().optional(),
  alt_text: z.string().optional(),
}).transform(data => ({
  ...data,
  altText: data.altText || data.alt_text,
}));

export const BasePostSchema = z.object({
  caption: z.string().optional(),
  media: z.array(MediaSchema).optional(),
  priority: z.nativeEnum(WorkloadPriority).default(WorkloadPriority.NORMAL),
  options: z.object({
    publishToFeed: z.boolean().default(true),
    publishToStory: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    validateToken: z.boolean().default(false),
    slackUsername: z.string().optional(),
    slackIconUrl: z.string().optional(),
    slackIconEmoji: z.string().optional(),
    retryConfig: z.object({
      maxRetries: z.number().default(3),
      backoffMs: z.number().default(1000),
    }).optional(),
  }).optional(),
});

export const FacebookPostSchema = BasePostSchema.refine(data => {
  const needsText = data.options?.publishToFeed !== false || data.options?.publishToStory === true;
  if (!needsText) return true;
  const hasGlobalCaption = !!data.caption && data.caption.trim().length > 0;
  const hasMediaAlt = data.media && data.media.length > 0 && data.media.some(m => !!(m.altText || (m as any).alt_text));
  return hasGlobalCaption || hasMediaAlt;
}, {
  message: "A caption or media alt-text is required for Facebook posts.",
  path: ["caption"]
});

export const TwitterPostSchema = BasePostSchema; // X allows empty text with media
export const SlackPostSchema = BasePostSchema; // Slack allows empty text (might just be blocks)

export const PostRequestSchema = z.discriminatedUnion("platform", [
  FacebookPostSchema.extend({ platform: z.literal('fb') }),
  TwitterPostSchema.extend({ platform: z.literal('x') }),
  SlackPostSchema.extend({ platform: z.literal('slack') }),
]);

export type PostRequest = z.infer<typeof PostRequestSchema>;
