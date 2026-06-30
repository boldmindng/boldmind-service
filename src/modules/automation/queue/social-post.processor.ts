// src/modules/automation/queue/social-post.processor.ts
//
// Migrated from @nestjs/bull → @nestjs/bullmq. Queue renamed from the
// hardcoded 'social-posts' to QUEUES.SOCIAL_PUBLISHING ('social-publishing'),
// matching the canonical queue map. Producers (e.g. automation.service.ts,
// planai social-media-manager.service.ts) must add jobs with
// JOBS.SOCIAL.POST instead of the bare string 'post'.

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOBS } from '../../../common/constants/queues';

interface SocialPostJobData {
  userId: string;
  platforms: string[];
  content: string;
  mediaUrls?: string[];
  caption?: string;
  hashtags?: string[];
}

@Processor(QUEUES.SOCIAL_PUBLISHING)
export class SocialPostProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialPostProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<SocialPostJobData>): Promise<any> {
    switch (job.name) {
      case JOBS.SOCIAL.POST:
        return this.handleSocialPost(job);
      default:
        this.logger.warn(`Unhandled job "${job.name}" on queue "${QUEUES.SOCIAL_PUBLISHING}"`);
        return null;
    }
  }

  private async handleSocialPost(job: Job<SocialPostJobData>) {
    const { platforms, content, mediaUrls, caption, hashtags } = job.data;
    this.logger.log(`Processing social post for platforms: ${platforms.join(', ')}`);

    const results: Record<string, any> = {};

    for (const platform of platforms) {
      try {
        results[platform] = await this.postToPlatform(platform, content, mediaUrls, caption, hashtags);
        this.logger.log(`Posted to ${platform} ✓`);
      } catch (err: any) {
        this.logger.error(`Failed to post to ${platform}:`, err.message);
        results[platform] = { error: err.message };
      }
    }

    return results;
  }

  private async postToPlatform(
    platform: string,
    content: string,
    mediaUrls?: string[],
    caption?: string,
    hashtags?: string[],
  ): Promise<any> {
    const fullCaption = `${caption || content}\n\n${hashtags?.map((h) => `#${h}`).join(' ') || ''}`.trim();

    switch (platform.toLowerCase()) {
      case 'instagram': {
        const igToken = this.config.get<string>('META_PAGE_ACCESS_TOKEN');
        const igId = this.config.get<string>('INSTAGRAM_BUSINESS_ID');
        if (!igToken || !igId) throw new Error('Instagram not configured');

        if (mediaUrls?.[0]) {
          const { data: container } = await axios.post(
            `https://graph.facebook.com/v19.0/${igId}/media`,
            { image_url: mediaUrls[0], caption: fullCaption, access_token: igToken },
          );
          const { data: result } = await axios.post(
            `https://graph.facebook.com/v19.0/${igId}/media_publish`,
            { creation_id: container.id, access_token: igToken },
          );
          return result;
        }
        break;
      }

      case 'facebook': {
        const pageToken = this.config.get<string>('META_PAGE_ACCESS_TOKEN');
        const pageId = this.config.get<string>('FACEBOOK_PAGE_ID');
        if (!pageToken || !pageId) throw new Error('Facebook not configured');

        const { data } = await axios.post(
          `https://graph.facebook.com/v19.0/${pageId}/feed`,
          { message: fullCaption, access_token: pageToken },
        );
        return data;
      }

      case 'twitter':
      case 'x': {
        // Placeholder — requires Twitter API v2 OAuth2
        this.logger.warn('Twitter/X posting not yet configured');
        return { status: 'skipped', reason: 'Twitter API not configured' };
      }

      default:
        this.logger.warn(`Platform ${platform} not yet supported for auto-posting`);
        return { status: 'skipped' };
    }
  }
}