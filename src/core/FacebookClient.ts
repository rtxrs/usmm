import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { FISResponse, MediaAsset } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class FacebookClient {
  private api: AxiosInstance;
  private pageId: string;

  constructor(pageId: string, accessToken: string) {
    this.pageId = pageId;
    this.api = axios.create({
      baseURL: `https://graph.facebook.com/v24.0`,
      params: { access_token: accessToken },
      proxy: false, // Force bypass any system/environment proxy
    });
  }

  async uploadMedia(asset: MediaAsset): Promise<string> {
    const isVideo = asset.type === 'video';
    // Videos use a dedicated subdomain and we use v24.0 for everything
    const baseUrl = isVideo ? 'https://graph-video.facebook.com/v24.0' : 'https://graph.facebook.com/v24.0';
    const endpoint = `${baseUrl}/${this.pageId}/${isVideo ? 'videos' : 'photos'}`;
    const textParam = isVideo ? 'description' : 'caption';
    const accessToken = (this.api.defaults.params as any)?.access_token;
    
    const form = new FormData();
    
    // access_token MUST be in the form body for graph-video uploads
    if (accessToken) form.append('access_token', accessToken);

    if (asset.source instanceof Buffer) {
      const filename = isVideo ? 'upload.mp4' : 'upload.png';
      form.append('source', asset.source, { filename });
    } else {
      form.append(isVideo ? 'file_url' : 'url', asset.source);
    }

    form.append('published', 'false');
    if (asset.altText) form.append(textParam, asset.altText);

    const response = await axios.post(endpoint, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      proxy: false
    });

    return response.data.id;
  }

  async createFeedPost(caption: string, media?: { id: string, type: 'image' | 'video' }[], options?: any): Promise<FISResponse> {
    try {
      const hasVideo = media?.some(m => m.type === 'video');
      const videoId = media?.find(m => m.type === 'video')?.id;

      if (hasVideo && videoId) {
        // Videos MUST be published via the video node or /videos endpoint
        // To publish an unpublished video, we POST to the video ID itself
        const response = await this.api.post(`/${videoId}`, null, {
          params: { 
            description: caption,
            published: true 
          }
        });
        return {
          success: true,
          postId: response.data.id || videoId,
          timestamp: new Date().toISOString(),
        };
      }

      // Standard Photo/Text Feed Post
      const params: any = { message: caption };
      if (media && media.length > 0) {
        params.attached_media = JSON.stringify(
          media.map(m => ({ media_fbid: m.id }))
        );
      }

      const response = await this.api.post(`/${this.pageId}/feed`, null, { params });

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
    try {
      const endpoint = type === 'video' ? `/${this.pageId}/video_stories` : `/${this.pageId}/photo_stories`;
      const paramName = type === 'video' ? 'video_id' : 'photo_id';
      
      const response = await this.api.post(endpoint, null, {
        params: { [paramName]: mediaId }
      });

      return {
        success: true,
        postId: response.data.id,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async updatePost(postId: string, newCaption: string): Promise<FISResponse> {
    try {
      const response = await this.api.post(`/${postId}`, null, {
        params: { message: newCaption }
      });

      return {
        success: response.data.success,
        postId: postId,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async getProfilePicUrl(): Promise<string> {
    return `https://graph.facebook.com/${this.pageId}/picture?type=large`;
  }

  async validateToken(forceRealCheck: boolean = false): Promise<{ valid: boolean; name?: string; error?: string }> {
    try {
      // Allow 'mock' token to bypass real check for testing/dryRun
      const token = (this.api.defaults.params as any)?.access_token;
      if (token === 'mock') {
        return { valid: true, name: 'Mock FB User' };
      }

      const response = await this.api.get('/me', { params: { fields: 'name' } });
      return { valid: true, name: response.data.name };
    } catch (error: any) {
      const msg = error.response?.data?.error?.message || error.message;
      return { valid: false, error: msg };
    }
  }

  private handleError(error: any): FISResponse {
    const errorData = error.response?.data;
    const statusCode = error.response?.status;

    logger.error('Facebook API Error', { 
      status: statusCode, 
      data: errorData,
      message: error.message 
    });

    return {
      success: false,
      error: {
        code: errorData?.error?.code || 'UNKNOWN',
        message: errorData?.error?.message || error.message,
        raw: errorData || error,
      },
      timestamp: new Date().toISOString(),
    };
  }
}