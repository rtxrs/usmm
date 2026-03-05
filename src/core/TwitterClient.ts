import { TwitterApi } from 'twitter-api-v2';
import axios from 'axios';
import type { FISResponse, MediaAsset } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { BaseSocialClient } from './BaseSocialClient.js';
import { config } from '../config.js';

interface TwitterCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

export class TwitterClient extends BaseSocialClient {
  private api: TwitterApi;
  private creds: TwitterCredentials;

  constructor(credentialsRaw: string) {
    super('X (Twitter)');
    this.creds = this.parseCredentials(credentialsRaw);
    this.api = new TwitterApi({
      appKey: this.creds.appKey,
      appSecret: this.creds.appSecret,
      accessToken: this.creds.accessToken,
      accessSecret: this.creds.accessSecret,
    });
  }

  protected shouldRetryOnError(statusCode: number | undefined, errorCode: number | undefined, error: any): boolean {
    // X/Twitter specific: retry on 429, 500, 502, 503
    if (statusCode === 429 || statusCode === 500 || statusCode === 502 || statusCode === 503) {
      return true;
    }
    // Also retry on connection errors (no status code)
    if (statusCode === undefined) {
      return true;
    }
    return false;
  }

  private parseCredentials(raw: string): TwitterCredentials {
    try {
      let jsonStr = raw;
      // Check if it's Base64
      if (!raw.trim().startsWith('{')) {
        try {
          jsonStr = Buffer.from(raw, 'base64').toString('utf-8');
        } catch (e) {
          // If decoding fails, assume it was intended to be raw JSON but missing {
        }
      }
      
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.appKey || !parsed.appSecret || !parsed.accessToken || !parsed.accessSecret) {
        throw new Error('Missing required Twitter OAuth 1.0a keys (appKey, appSecret, accessToken, accessSecret)');
      }
      
      return parsed as TwitterCredentials;
    } catch (error: any) {
      throw new Error(`Invalid Twitter Credentials: ${error.message}`);
    }
  }

  async uploadMedia(asset: MediaAsset): Promise<string> {
    // Wrap with retry logic
    return await this.requestWithRetry(async () => {
      let mediaId: string;
      const isVideo = asset.type === 'video';
      const mimeType = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
      
      if (asset.source instanceof Buffer) {
        mediaId = await this.api.v1.uploadMedia(asset.source, { 
          mimeType, 
          type: isVideo ? 'video/mp4' : undefined,
          chunked: isVideo 
        } as any);
      } else {
        // Fetch URL source to Buffer first since twitter-api-v2 v1.1 upload needs it
        const response = await axios.get(asset.source as string, { responseType: 'arraybuffer', proxy: config.ALLOW_SYSTEM_PROXY ? undefined : false });
        const buffer = Buffer.from(response.data);
        mediaId = await this.api.v1.uploadMedia(buffer, { 
          mimeType, 
          type: isVideo ? 'video/mp4' : undefined,
          chunked: isVideo 
        } as any);
      }

      return mediaId;
    });
  }

  async validateToken(forceRealCheck: boolean = false): Promise<{ valid: boolean; name?: string; error?: string }> {
    // 1. Structural Check (Always performed)
    const creds = this.creds;
    if (!creds.appKey || !creds.appSecret || !creds.accessToken || !creds.accessSecret) {
      return { valid: false, error: "Missing one or more OAuth 1.0a credential fields." };
    }
    
    const isMock = creds.appKey === 'mock' || creds.accessToken === 'mock';
    if (!isMock && (creds.appKey.length < 10 || creds.accessToken.length < 10)) {
      return { valid: false, error: "Credentials appear structurally invalid (too short)." };
    }

    // 2. Optional Real API Check (Costs Quota)
    if (forceRealCheck && !isMock) {
      try {
        const user = await this.api.v1.verifyCredentials();
        return { valid: true, name: user.screen_name };
      } catch (error: any) {
        return { valid: false, error: `Twitter API Validation Failed: ${error.message}` };
      }
    }

    return { valid: true, name: isMock ? 'Mock X User' : 'X Account (Structural Check)' };
  }

  async createFeedPost(caption: string, media?: { id: string, type: 'image' | 'video' }[], options?: any): Promise<FISResponse> {
    try {
      const tweetData: any = { text: caption };
      
      if (media && media.length > 0) {
        tweetData.media = { media_ids: media.map(m => m.id) };
      }

      // Wrap with retry logic
      const response = await this.requestWithRetry(() => this.api.v2.tweet(tweetData));

      return {
        success: true,
        postId: response.data.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async createStory(mediaId: string, type: 'image' | 'video' = 'image'): Promise<FISResponse> {
    // Twitter doesn't have a public "Story" API like FB. 
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Stories (Fleets) are not supported on X.' },
      timestamp: new Date().toISOString(),
    };
  }

  async updatePost(postId: string, newCaption: string): Promise<FISResponse> {
    // Standard X API does not allow editing tweets.
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Tweet editing is not supported via the X API.' },
      timestamp: new Date().toISOString(),
    };
  }

  async getProfilePicUrl(): Promise<string> {
    const user = await this.api.v2.me({ 'user.fields': ['profile_image_url'] });
    const url = user.data.profile_image_url;
    return url ? url.replace('_normal', '_400x400') : 'https://placehold.co/400?text=Twitter';
  }

  private handleError(error: any): FISResponse {
    // Check for rate limiting (429)
    const isRateLimited = error.code === 429 || 
                          error.message?.includes('429') || 
                          error.message?.includes('rate limit');
    
    if (isRateLimited) {
      const retryAfter = error.rateLimit?.resetTime || 60;
      logger.warn(`X (Twitter) API rate limited. Retry after ${retryAfter}s`, { 
        retryAfter,
        endpoint: error.request?.path 
      });
    } else {
      logger.error('X (Twitter) API Error', { 
        data: error.data,
        message: error.message,
        code: error.code 
      });
    }

    return {
      success: false,
      error: {
        code: isRateLimited ? 'RATE_LIMITED' : (error.code?.toString() || 'X_API_ERROR'),
        message: error.message,
        raw: error.data || error,
        isRateLimited,
        retryAfter: isRateLimited ? (error.rateLimit?.resetTime || 60) : undefined
      },
      timestamp: new Date().toISOString(),
    };
  }
}
