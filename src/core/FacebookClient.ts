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
    let buffer: Buffer;

    if (asset.source instanceof Buffer) {
      buffer = asset.source;
    } else {
      const response = await axios.get(asset.source as string, { responseType: 'arraybuffer', proxy: false });
      buffer = Buffer.from(response.data);
    }

    if (isVideo) {
      return this.uploadVideoChunked(buffer, asset.mimeType);
    }

    // Standard Photo Upload (Single POST)
    const baseUrl = 'https://graph.facebook.com/v24.0';
    const endpoint = `${baseUrl}/${this.pageId}/photos`;
    const accessToken = (this.api.defaults.params as any)?.access_token;
    
    const form = new FormData();
    if (accessToken) form.append('access_token', accessToken);
    form.append('source', buffer, { filename: 'upload.png' });
    form.append('published', 'false');
    if (asset.altText) form.append('caption', asset.altText);

    const response = await axios.post(endpoint, form, {
      headers: form.getHeaders(),
      proxy: false
    });

    return response.data.id;
  }

  /**
   * Performs a resumable (chunked) upload for large videos to Facebook.
   * Recommended for files > 25MB or high-reliability requirements.
   */
  private async uploadVideoChunked(buffer: Buffer, mimeType: string = 'video/mp4'): Promise<string> {
    const accessToken = (this.api.defaults.params as any)?.access_token;
    const baseUrl = 'https://graph-video.facebook.com/v24.0';
    const endpoint = `${baseUrl}/${this.pageId}/videos`;
    const fileSize = buffer.length;
    const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks

    logger.debug('Starting chunked video upload to FB', { fileSize, chunks: Math.ceil(fileSize / CHUNK_SIZE) });

    // Phase 1: START
    const startRes = await axios.post(endpoint, null, {
      params: {
        access_token: accessToken,
        upload_phase: 'start',
        file_size: fileSize
      },
      proxy: false
    });

    const uploadSessionId = startRes.data.upload_session_id;
    let startOffset = 0;

    // Phase 2: APPEND
    while (startOffset < fileSize) {
      const endOffset = Math.min(startOffset + CHUNK_SIZE, fileSize);
      const chunk = buffer.slice(startOffset, endOffset);

      const form = new FormData();
      form.append('access_token', accessToken);
      form.append('upload_phase', 'transfer');
      form.append('upload_session_id', uploadSessionId);
      form.append('start_offset', startOffset.toString());
      form.append('video_file_chunk', chunk, { filename: 'chunk.mp4', contentType: mimeType });

      await axios.post(endpoint, form, {
        headers: form.getHeaders(),
        proxy: false
      });

      startOffset = endOffset;
      logger.debug('Uploaded FB video chunk', { startOffset, total: fileSize });
    }

    // Phase 3: FINISH
    const finishRes = await axios.post(endpoint, null, {
      params: {
        access_token: accessToken,
        upload_phase: 'finish',
        upload_session_id: uploadSessionId
      },
      proxy: false
    });

    const videoId = finishRes.data.id || finishRes.data.video_id;

    // Wait for processing to begin (basic polling can be added if needed)
    await new Promise(resolve => setTimeout(resolve, 2000));

    return videoId;
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