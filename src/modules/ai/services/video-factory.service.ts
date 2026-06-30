import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AiService } from '../ai.service';

export interface PostToSocialize {
    id?: string;
    _id?: string;
    title: string;
    content: string;
    excerpt?: string;
    media?: { featuredImage?: string };
    tags?: string[];
    language?: 'pidgin' | 'english' | 'yoruba' | 'igbo' | 'hausa';
    category?: string;
}

export type TargetPlatform = 'facebook' | 'instagram' | 'tiktok' | 'twitter' | 'whatsapp' | 'linkedin' | 'youtube';

export interface SocialContentPackage {
    sourceId: string;
    sourceType: string;
    platforms: Record<TargetPlatform, PlatformContent | null>;
    scheduledAt?: string;
    status: 'queued' | 'processing' | 'done' | 'failed';
    jobId?: string;
}

export interface PlatformContent {
    caption: string;
    hashtags: string[];
    callToAction: string;
    imagePrompt?: string;  // For AI image generation
    imageUrl?: string;     // Cloudflare R2 URL
    characterCount: number;
    platformSpecificData?: Record<string, unknown>;
}

export interface WhatsAppBroadcast {
    message: string;
    imageUrl?: string;
    ctaUrl?: string;
    ctaText?: string;
}

// ─── Platform constraints ─────────────────────────────────────────────────────

const PLATFORM_LIMITS: Record<TargetPlatform, { maxChars: number; maxHashtags: number }> = {
    twitter: { maxChars: 280, maxHashtags: 3 },
    instagram: { maxChars: 2200, maxHashtags: 30 },
    facebook: { maxChars: 63206, maxHashtags: 5 },
    tiktok: { maxChars: 2200, maxHashtags: 20 },
    whatsapp: { maxChars: 1000, maxHashtags: 0 },
    linkedin: { maxChars: 3000, maxHashtags: 10 },
    youtube: {  maxChars: 2000, maxHashtags: 2}
};

@Injectable()
export class VideoFactoryService {
    private readonly logger = new Logger(VideoFactoryService.name);

    constructor(
        private readonly ai: AiService,
        @InjectQueue('social-factory') private readonly socialQueue: Queue,
        @InjectQueue('video-render') private readonly videoQueue: Queue,
    ) { }

    // ──────────────────────────────────────────────────────────────────────────
    // MAIN: Convert post to social content package (previously the axios call)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Replaces: VideoFactoryService.convertPostToVideo(post)
     * Now internal — generates social content via AI and queues async jobs
     */
    async convertPostToVideo(
        post: PostToSocialize,
        targetPlatforms: TargetPlatform[] = ['facebook', 'instagram', 'tiktok'],
    ): Promise<SocialContentPackage | null> {
        try {
            const sourceId = String(post._id ?? post.id ?? Date.now());

            // Queue the social content generation job
            const job = await this.socialQueue.add(
                'generate-social-content',
                {
                    sourceId,
                    sourceType: 'amebogist',
                    post,
                    targetPlatforms,
                },
                {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 2000 },
                    removeOnComplete: { age: 86400 }, // Keep 24hrs
                    removeOnFail: { age: 86400 * 7 }, // Keep failed 7 days
                },
            );

            this.logger.log(`Social content job queued: ${job.id} for post ${sourceId}`);

            return {
                sourceId,
                sourceType: 'amebogist',
                platforms: { facebook: null, instagram: null, tiktok: null, twitter: null, whatsapp: null, linkedin: null, youtube: null},
                status: 'queued',
                jobId: job.id,
            };
        } catch (err) {
            this.logger.error(`VideoFactory queue error: ${String(err)}`);
            return null; // Non-fatal, matches original behavior
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AI: Generate platform-specific social content
    // ──────────────────────────────────────────────────────────────────────────

    async generateSocialContentPackage(
        post: PostToSocialize,
        platforms: TargetPlatform[] = ['instagram', 'twitter', 'whatsapp'],
    ): Promise<Record<TargetPlatform, PlatformContent | null>> {
        const language = post.language ?? 'english';

        const systemPrompt = `You are a Nigerian social media content strategist for AmeboGist.
You create platform-optimized content that resonates with Nigerian tech entrepreneurs, creators, and digital-savvy users.
${language === 'pidgin' ? 'Use Nigerian Pidgin English where specified. Be authentic, energetic, and relatable.' : ''}
Always reference Nigerian context: prices in Naira, local platforms (WhatsApp, etc.), Nigerian examples.`;

        const platformSpecs = platforms.map((p) => {
            const limits = PLATFORM_LIMITS[p];
            return `${p}: max ${limits.maxChars} chars, max ${limits.maxHashtags} hashtags, ${this.getPlatformTone(p, language)}`;
        });

        const userMessage = `Convert this article into social media content for Nigerian audiences:

Title: ${post.title}
Excerpt: ${post.excerpt ?? post.content.slice(0, 300)}
Tags: ${post.tags?.join(', ') ?? ''}
Language: ${language}

Generate content for these platforms:
${platformSpecs.join('\n')}

Return JSON object with platform keys: ${platforms.join(', ')}
Each value: { caption, hashtags (array), callToAction, imagePrompt (describe ideal image for this post) }
ONLY return the JSON object.`;

        const result = await this.ai.generateJson<Partial<Record<TargetPlatform, PlatformContent>>>(
            systemPrompt,
            userMessage,
            { task: 'creative', temperature: 0.8, cacheTtl: 3600 },
        );

        const output: Record<TargetPlatform, PlatformContent | null> = {
            facebook: null, instagram: null, tiktok: null, twitter: null, whatsapp: null, linkedin: null, youtube: null
        };

        for (const platform of platforms) {
            const content = result.content[platform];
            if (content) {
                const limits = PLATFORM_LIMITS[platform];
                output[platform] = {
                    caption: (content.caption ?? '').slice(0, limits.maxChars),
                    hashtags: (content.hashtags ?? []).slice(0, limits.maxHashtags),
                    callToAction: content.callToAction ?? 'Read more on AmeboGist 👉',
                    imagePrompt: content.imagePrompt,
                    characterCount: (content.caption ?? '').length,
                };
            }
        }

        return output;
    }

    /**
     * Generate WhatsApp broadcast message for a post
     */
    async generateWhatsAppBroadcast(post: PostToSocialize): Promise<WhatsAppBroadcast> {
        const language = post.language ?? 'pidgin';

        const result = await this.ai.chat(
            `You write viral WhatsApp broadcast messages for Nigerian audiences.
       ${language === 'pidgin' ? 'Write in Nigerian Pidgin English.' : ''}
       Messages should be short (max 500 chars), engaging, drive clicks.
       Use emojis sparingly but effectively. No hashtags for WhatsApp.`,
            `Create a WhatsApp broadcast message for this article:
Title: ${post.title}
Excerpt: ${post.excerpt ?? post.content.slice(0, 200)}

Message should: tease the content, create FOMO, include a CTA.
Return ONLY the message text.`,
            { task: 'creative', temperature: 0.85 },
        );

        return {
            message: result.content.slice(0, 1000),
            imageUrl: post.media?.featuredImage,
            ctaUrl: `https://amebogist.ng/posts/${post._id ?? post.id}`,
            ctaText: language === 'pidgin' ? 'Read am here 👇' : 'Read the full story 👇',
        };
    }

    /**
     * Schedule content distribution via BullMQ delayed jobs
     */
    async scheduleContentDistribution(params: {
        postId: string;
        platforms: TargetPlatform[];
        publishAt: Date;
        content: Partial<Record<TargetPlatform, PlatformContent>>;
    }): Promise<string[]> {
        const delay = Math.max(0, params.publishAt.getTime() - Date.now());
        const jobIds: string[] = [];

        for (const platform of params.platforms) {
            const platformContent = params.content[platform];
            if (!platformContent) continue;

            const job = await this.socialQueue.add(
                'publish-to-platform',
                {
                    postId: params.postId,
                    platform,
                    content: platformContent,
                    scheduledFor: params.publishAt.toISOString(),
                },
                {
                    delay,
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                },
            );

            jobIds.push(job.id ?? '');
            this.logger.log(`Scheduled ${platform} post for ${params.publishAt.toISOString()} (job: ${job.id})`);
        }

        return jobIds;
    }

    /**
     * Get job status by ID
     */
    async getJobStatus(jobId: string): Promise<{
        status: string;
        progress?: number;
        result?: unknown;
        error?: string;
    }> {
        const job = await this.socialQueue.getJob(jobId);
        if (!job) return { status: 'not_found' };

        const state = await job.getState();
        return {
            status: state,
            progress: job.progress as number,
            result: job.returnvalue,
            error: job.failedReason,
        };
    }

    /**
     * Queue an image generation + upload for a post
     */
    async generateAndUploadImage(params: {
        postId: string;
        imagePrompt: string;
        platform: TargetPlatform;
    }): Promise<string | null> {
        try {
            const format = this.getPlatformImageFormat(params.platform);
            const imageResult = await this.ai.generateSocialImage(params.imagePrompt, format);

            if (imageResult.url) return imageResult.url;

            if (imageResult.data) {
                // TODO: Upload to Cloudflare R2
                // const key = `social/${params.postId}/${params.platform}.jpg`;
                // return this.r2.upload(key, imageResult.data, 'image/jpeg');
                this.logger.warn('R2 upload not implemented — returning null');
                return null;
            }

            return null;
        } catch (err) {
            this.logger.error(`Image gen failed: ${String(err)}`);
            return null;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private getPlatformTone(platform: TargetPlatform, language: string): string {
        const tones: Record<TargetPlatform, string> = {
            twitter: 'punchy, witty, conversational, news-hook style',
            instagram: 'visual-first, storytelling caption, lifestyle-adjacent',
            tiktok: `${language === 'pidgin' ? 'Gen-Z Pidgin vibes, ' : ''}trendy, educational hooks`,
            facebook: 'community-building, shareable, discussion-starter',
            whatsapp: 'personal, broadcast-ready, action-oriented',
            linkedin: 'professional, thought-leadership, business case',
            youtube: 'cultural, community-building, elderly'
        };
        return tones[platform] ?? 'engaging, Nigerian-market-aware';
    }

    private getPlatformImageFormat(platform: TargetPlatform): 'square' | 'portrait' | 'landscape' | 'whatsapp-flyer' {
        const formats: Record<TargetPlatform, 'square' | 'portrait' | 'landscape' | 'whatsapp-flyer'> = {
            instagram: 'square',
            tiktok: 'portrait',
            facebook: 'landscape',
            twitter: 'landscape',
            whatsapp: 'whatsapp-flyer',
            linkedin: 'landscape',
            youtube: 'landscape'
        };
        return formats[platform] ?? 'square';
    }
}