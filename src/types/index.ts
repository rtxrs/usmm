export enum WorkloadPriority {
  CRITICAL = 10,  // Tsunami, Mag 5+
  HIGH = 5,      // Weather Alert, Mag 2+
  NORMAL = 0,    // Daily Summary, Synthetic Advisory
}

export type MediaAsset = {
  source: Buffer | string; // Buffer or file path
  type: 'image' | 'video';
  mimeType?: string;
  altText?: string;
};

export interface PostOptions {
  priority?: WorkloadPriority;
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
  scheduledTime?: Date;
  metadata?: Record<string, any>;
  publishToFeed?: boolean;
  publishToStory?: boolean;
}

export interface FISResponse {
  success: boolean;
  postId?: string;
  mediaIds?: string[];
  error?: {
    code: string;
    message: string;
    raw?: any;
  };
  timestamp: string;
}
