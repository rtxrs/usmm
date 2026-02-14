import { TwitterApi } from 'twitter-api-v2';
import type { FISResponse, MediaAsset } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface TwitterCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

export class TwitterClient {
  private api: TwitterApi;
  private creds: TwitterCredentials;

  constructor(credentialsRaw: string) {
    this.creds = this.parseCredentials(credentialsRaw);
    this.api = new TwitterApi({
      appKey: this.creds.appKey,
      appSecret: this.creds.appSecret,
      accessToken: this.creds.accessToken,
      accessSecret: this.creds.accessSecret,
    });
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
    try {
      let mediaId: string;
      
      if (asset.source instanceof Buffer) {
        // Use provided mimeType or fall back to standard types
        const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        
        mediaId = await this.api.v1.uploadMedia(asset.source, { mimeType });
      } else {
        // twitter-api-v2 doesn't directly support URL upload in v1.1 simple upload
        // We would need to fetch it first. For now, we assume Buffer (coming from USMM Multipart)
        throw new Error('Twitter Client currently only supports Buffer-based media uploads.');
      }

      return mediaId;
    } catch (error: any) {
      logger.error('Twitter Media Upload Error', { error: error.message });
      throw error;
    }
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

      const response = await this.api.v2.tweet(tweetData);

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
    // We could potentially implement "Fleets" if they ever return, or just another tweet.
    // For now, we return a failure or a fallback.
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
    // Twitter returns a 'normal' sized image by default, we want it larger if possible
    // normal is 48x48, we can replace '_normal' with '' for original size or '_400x400'
    const url = user.data.profile_image_url;
    return url ? url.replace('_normal', '_400x400') : 'https://placehold.co/400?text=Twitter';
  }

  private handleError(error: any): FISResponse {
    logger.error('X (Twitter) API Error', { 
      data: error.data,
      message: error.message 
    });

    return {
      success: false,
      error: {
        code: error.code?.toString() || 'X_API_ERROR',
        message: error.message,
        raw: error.data || error,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
