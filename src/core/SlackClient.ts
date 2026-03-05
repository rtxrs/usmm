import axios from 'axios';
import type { FISResponse, MediaAsset } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { SlackFormatter } from '../utils/SlackFormatter.js';
import { BaseSocialClient } from './BaseSocialClient.js';
import { config } from '../config.js';

export class SlackClient extends BaseSocialClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    super('Slack');
    this.webhookUrl = this.validateAndNormalizeUrl(webhookUrl);
  }

  private validateAndNormalizeUrl(url: string): string {
    let target = url;
    // Check if it's Base64 encoded
    if (!url.startsWith('http')) {
      try {
        target = Buffer.from(url, 'base64').toString('utf-8');
      } catch (e) {
        // Fallback to original if not base64
      }
    }

    if (!target.startsWith('https://hooks.slack.com/')) {
      throw new Error('Invalid Slack Webhook URL. Must start with https://hooks.slack.com/');
    }
    return target;
  }

  async uploadMedia(asset: MediaAsset): Promise<string> {
    // Slack webhooks don't support direct media upload in the same way FB/X do.
    if (typeof asset.source === 'string') {
      return asset.source;
    }
    logger.warn('Slack Webhook integration does not support direct Buffer uploads. Use image URLs.');
    return 'https://placehold.co/600x400?text=Media+Upload+Not+Supported+on+Slack+Webhook';
  }

  async createFeedPost(caption: string, media?: { id: string, type: 'image' | 'video' }[], options?: any): Promise<FISResponse> {
    try {
      const blocks = SlackFormatter.parse(caption, media);
      
      const payload: any = {
        username: options?.slackUsername || 'USMM',
        text: caption.replace(/<[^>]*>/g, '').substring(0, 150), // Fallback notification text
        blocks: blocks
      };

      if (options?.slackIconEmoji) {
        payload.icon_emoji = options.slackIconEmoji;
      } else {
        payload.icon_url = options?.slackIconUrl || 'https://usmm.global-desk.top/images/USMM-logo-full-transparent.png';
      }

      const response = await this.requestWithRetry(() => axios.post(this.webhookUrl, payload, { proxy: config.ALLOW_SYSTEM_PROXY ? undefined : false }));

      return {
        success: true,
        postId: `slack_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  async validateToken(forceRealCheck: boolean = false): Promise<{ valid: boolean; name?: string; error?: string }> {
    return { valid: true, name: 'Slack Webhook' };
  }

  async getProfilePicUrl(): Promise<string> {
    return 'https://cdn.brandfetch.io/slack.com/w/400/h/400';
  }

  async updatePost(postId: string, newCaption: string): Promise<FISResponse> {
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Slack Webhooks do not support updating posts.' },
      timestamp: new Date().toISOString(),
    };
  }

  async createStory(): Promise<FISResponse> {
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Stories are not supported on Slack.' },
      timestamp: new Date().toISOString(),
    };
  }

  private handleError(error: any): FISResponse {
    this.handleApiError(error);
    return {
      success: false,
      error: {
        code: 'SLACK_ERROR',
        message: error.response?.data || error.message,
        raw: error.response?.data || error,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
