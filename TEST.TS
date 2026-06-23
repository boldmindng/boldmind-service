// import {
//   Injectable, ForbiddenException, NotFoundException, Logger,
// } from '@nestjs/common';
// import { PrismaService } from '../../../database/prisma.service';
// import { RedisService } from '../../../database/redis.service';
// import { AiService } from '../../ai/ai.service';
// import { SubscriptionStatus, SubscriptionTier, PlanAIJobType } from '@prisma/client';
// import {
//   PLANAI_PRICING, PLANAI_TOOL_SLUGS, TIER_TOOL_ACCESS,
//   INDUSTRY_BUNDLES, PlanAIScore, PlanAIToolSlug, IndustryBundle,
// } from '../interfaces/planai.types';
// import { OnboardingDto, MonthlyDigestDto } from '../dto/planai.dto';

// // ═════════════════════════════════════════════════════════════════════════════
// // SUITE SERVICE
// // ═════════════════════════════════════════════════════════════════════════════
// @Injectable()
// export class PlanAISuiteService {
//   private readonly logger = new Logger(PlanAISuiteService.name);

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly redis: RedisService,
//     private readonly ai: AiService,
//   ) {}

//   async getActiveSub(userId: string) {
//     return this.prisma.subscription.findUnique({
//       where: { userId_productSlug: { userId, productSlug: 'planai' } },
//     });
//   }

//   async getSuiteDashboard(userId: string) {
//     const cacheKey = `planai:dashboard:${userId}`;
//     const cached = await this.redis.get(cacheKey);
//     if (cached) return JSON.parse(cached) as Record<string, unknown>;

//     const [sub, jobs, stores, tasks] = await Promise.all([
//       this.getActiveSub(userId),
//       this.prisma.planAIJob.count({ where: { userId } }),
//       this.prisma.store.count({ where: { userId } }),
//       this.prisma.task.count({ where: { createdById: userId } }),
//     ]);

//     const tier = (sub?.tier ?? 'FREE') as SubscriptionTier;
//     const accessible = this.getAccessibleTools(tier);

//     const dashboard = {
//       subscription: sub
//         ? { tier: sub.tier, status: sub.status, currentPeriodEnd: sub.currentPeriodEnd, amountNGN: sub.amountNGN / 100 }
//         : null,
//       toolAccess: {
//         tier,
//         accessible,
//         locked: PLANAI_TOOL_SLUGS.filter((s) => !accessible.includes(s)),
//         activatedCount: accessible.length,
//         totalCount: PLANAI_TOOL_SLUGS.length,
//       },
//       stats: { jobsRun: jobs, storesCreated: stores, tasksCreated: tasks },
//       pricing: this.getPricingTable(),
//     };

//     await this.redis.setex(cacheKey, 300, JSON.stringify(dashboard));
//     return dashboard;
//   }

//   async onboard(userId: string, dto: OnboardingDto) {
//     const recommended: PlanAIToolSlug[] = dto.industryBundle
//       ? [...INDUSTRY_BUNDLES[dto.industryBundle as IndustryBundle]]
//       : dto.selectedTools ?? ['social-media-manager', 'brand-digital-home', 'project-manager'];

//     await this.prisma.userProfile.upsert({
//       where: { userId },
//       create: { userId, displayName: dto.businessName, state: dto.state, language: dto.preferredLanguage ?? 'en' },
//       update: { displayName: dto.businessName, state: dto.state, language: dto.preferredLanguage ?? 'en' },
//     });

//     await this.prisma.activityLog.create({
//       data: {
//         userId, action: 'planai.onboarding_complete', productSlug: 'planai',
//         metadata: { businessName: dto.businessName, businessType: dto.businessType, industryBundle: dto.industryBundle, recommended },
//       },
//     });

//     await this.redis.del(`planai:dashboard:${userId}`);

//     return {
//       message: 'Onboarding complete. Welcome to PlanAI!',
//       businessName: dto.businessName,
//       industryBundle: dto.industryBundle ?? null,
//       recommendedTools: recommended,
//       nextStep: 'Visit your PlanAI dashboard to activate your first tool.',
//     };
//   }

//   getAccessibleTools(tier: SubscriptionTier): PlanAIToolSlug[] {
//     const access = TIER_TOOL_ACCESS[tier];
//     if (access === 'all') return [...PLANAI_TOOL_SLUGS];
//     return access as PlanAIToolSlug[];
//   }

//   async assertToolAccess(userId: string, toolSlug: PlanAIToolSlug): Promise<void> {
//     const sub = await this.getActiveSub(userId);
//     const tier = (sub?.tier ?? 'FREE') as SubscriptionTier;

//     if (sub && sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.TRIAL) {
//       throw new ForbiddenException('Your PlanAI subscription is inactive. Please renew to continue.');
//     }

//     const accessible = this.getAccessibleTools(tier);
//     if (!accessible.includes(toolSlug)) {
//       throw new ForbiddenException(
//         `${toolSlug} requires PlanAI Pro (₦25,000/month). Upgrade to unlock all 13 tools.`,
//       );
//     }
//   }

//   async computePlanAIScore(userId: string): Promise<PlanAIScore> {
//     const cacheKey = `planai:score:${userId}`;
//     const cached = await this.redis.get(cacheKey);
//     if (cached) return JSON.parse(cached) as PlanAIScore;

//     const [sub, jobs, stores, tasks, workoutLogs, cbtSessions] = await Promise.all([
//       this.getActiveSub(userId),
//       this.prisma.planAIJob.findMany({ where: { userId }, select: { type: true, status: true } }),
//       this.prisma.store.aggregate({ where: { userId }, _sum: { totalRevenue: true, totalOrders: true }, _count: { id: true } }),
//       this.prisma.task.count({ where: { createdById: userId, status: 'DONE' } }),
//       this.prisma.workoutLog.count({ where: { userId } }),
//       this.prisma.cBTSession.count({ where: { userId } }),
//     ]);

//     const tier = (sub?.tier ?? 'FREE') as SubscriptionTier;
//     const toolsActivated = this.getAccessibleTools(tier).length;

//     const digital_presence     = Math.min(100, (stores._count.id * 30) + Math.min(40, (stores._sum.totalOrders ?? 0)));
//     const marketing_reach      = Math.min(100, jobs.filter((j) => j.type === 'MARKETING_CAMPAIGN').length * 20);
//     const financial_clarity    = Math.min(100, jobs.filter((j) => ['FINANCIAL_FORECAST','BUSINESS_PLAN'].includes(j.type)).length * 25);
//     const operational_efficiency = Math.min(100, tasks * 4 + toolsActivated * 3);
//     const growth_potential     = Math.min(100, toolsActivated * 7);
//     const investor_readiness   = Math.min(100, jobs.filter((j) => ['INVESTOR_DECK','PITCH_DECK'].includes(j.type)).length * 30);

//     const overall = Math.round(
//       digital_presence    * 0.20 +
//       marketing_reach     * 0.20 +
//       financial_clarity   * 0.20 +
//       operational_efficiency * 0.15 +
//       growth_potential    * 0.15 +
//       investor_readiness  * 0.10,
//     );

//     const recommendations: string[] = [];
//     if (digital_presence     < 40) recommendations.push('Set up your digital storefront in Brand & Digital Home');
//     if (marketing_reach      < 20) recommendations.push('Launch your first campaign in Marketing Automation');
//     if (financial_clarity    < 20) recommendations.push('Generate a business plan or financial forecast in BizIntel');
//     if (investor_readiness   < 10) recommendations.push('Build your investor deck in Investor Readiness Suite');
//     if (toolsActivated       <  5) recommendations.push('Upgrade to PlanAI Pro to unlock all 13 tools');

//     const score: PlanAIScore = {
//       userId, overall,
//       dimensions: { digital_presence, marketing_reach, financial_clarity, operational_efficiency, growth_potential, investor_readiness },
//       recommendations, toolsActivated,
//       computedAt: new Date().toISOString(),
//     };

//     await this.redis.setex(cacheKey, 3600, JSON.stringify(score));
//     return score;
//   }

//   async getMonthlyDigest(userId: string, dto: MonthlyDigestDto) {
//     const now   = new Date();
//     const month = dto.month ?? now.getMonth() + 1;
//     const year  = dto.year  ?? now.getFullYear();

//     const start = new Date(year, month - 1, 1);
//     const end   = new Date(year, month, 0, 23, 59, 59);

//     const [jobsRun, ordersReceived, payments, tasksCompleted] = await Promise.all([
//       this.prisma.planAIJob.count({ where: { userId, createdAt: { gte: start, lte: end } } }),
//       this.prisma.order.count({ where: { store: { userId }, createdAt: { gte: start, lte: end } } }),
//       this.prisma.payment.aggregate({ where: { userId, status: 'SUCCESS', paidAt: { gte: start, lte: end } }, _sum: { amountNGN: true } }),
//       this.prisma.task.count({ where: { createdById: userId, status: 'DONE', completedAt: { gte: start, lte: end } } }),
//     ]);

//     const revenueNGN = (payments._sum.amountNGN ?? 0) / 100;

//     // AI-written digest narrative
//     const narrative = await this.ai.generateNigerianContent(
//       'You are a Nigerian business AI assistant writing a concise monthly digest. Valid JSON only.',
//       'english',
//       `Write a friendly monthly business digest.
// Month: ${start.toLocaleString('en-NG', { month: 'long', year: 'numeric' })}
// Stats: ${jobsRun} AI jobs run, ${ordersReceived} orders received, ₦${revenueNGN.toLocaleString('en-NG')} processed, ${tasksCompleted} tasks completed.

// Return JSON: { headline, summary (2 sentences), topInsight, motivation (Nigerian-flavoured closing line) }`,
//       { task: 'fast-chat', temperature: 0.8, cacheTtl: 0 },
//     ).then((r) => {
//       try { return JSON.parse(r.content) as Record<string, unknown>; }
//       catch { return { headline: `${start.toLocaleString('en-NG', { month: 'long' })} Digest`, summary: `${jobsRun} jobs and ${ordersReceived} orders this month.` }; }
//     }).catch(() => ({}));

//     return {
//       period: { month, year, label: start.toLocaleString('en-NG', { month: 'long', year: 'numeric' }) },
//       stats: { jobsRun, ordersReceived, revenueNGN, tasksCompleted },
//       narrative,
//     };
//   }

//   getPricingTable() {
//     return Object.entries(PLANAI_PRICING).map(([tier, kobo]) => ({
//       tier,
//       monthlyNGN: kobo / 100,
//       toolCount: this.getAccessibleTools(tier as SubscriptionTier).length,
//     }));
//   }

//   getIndustryBundle(bundle: IndustryBundle) {
//     return { bundle, tools: INDUSTRY_BUNDLES[bundle] };
//   }
// }


   



// import { Injectable, Logger } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { InjectQueue } from '@nestjs/bullmq';
// import { Queue } from 'bullmq';
// import { firstValueFrom } from 'rxjs';
// import { ConfigService } from '@nestjs/config';
// import { PrismaService } from '../../../database/prisma.service';
// import { RedisService } from '../../../database/redis.service';
// import { AiService } from '../../ai/ai.service';
// import {
//   GenerateCaptionDto, SchedulePostDto, BulkContentDto, AutoReplyConfigDto,
// } from '../dto/planai.dto';
// import { SocialPlatform, NgLanguage } from '../interfaces/planai.types';

// interface PostJobPayload {
//   userId: string;
//   content: string;
//   platforms: SocialPlatform[];
//   mediaUrls: string[];
//   scheduledAt: string;
// }

// @Injectable()
// export class SocialMediaService {
//   private readonly logger = new Logger(SocialMediaService.name);

//   // WhatsApp / Meta config
//   private readonly waApiVersion = 'v19.0';
//   private readonly waToken: string;
//   private readonly igAccessToken: string;

//   constructor(
//     private readonly prisma: PrismaService,
//     private readonly redis: RedisService,
//     private readonly ai: AiService,
//     private readonly http: HttpService,
//     private readonly config: ConfigService,
//     @InjectQueue('social-posts') private readonly socialQueue: Queue,
//   ) {
//     this.waToken       = this.config.get<string>('META_WHATSAPP_TOKEN', '');
//     this.igAccessToken = this.config.get<string>('META_IG_ACCESS_TOKEN', '');
//   }

//   // ─── Caption generation ──────────────────────────────────────────────────────

//   async generateCaption(userId: string, dto: GenerateCaptionDto) {
//     const platform  = dto.platform ?? 'instagram';
//     const language  = (dto.language ?? 'english') as NgLanguage;
//     const cacheKey  = `social:caption:${userId}:${Buffer.from(dto.topic + platform + language).toString('base64').slice(0, 20)}`;

//     const cached = await this.redis.get(cacheKey);
//     if (cached) return JSON.parse(cached) as Record<string, unknown>;

//     const platformGuide: Record<SocialPlatform, string> = {
//       instagram:       'Engaging hook first line. 150-300 chars body. 10-20 hashtags. Line breaks for readability.',
//       tiktok:          'Ultra-short hook (under 100 chars). Punchy. 3-5 hashtags. Mention trending audio if relevant.',
//       facebook:        'Conversational. 200-400 chars. Ask a question to drive comments. 2-3 hashtags.',
//       twitter:         'Under 280 chars. Direct. One strong hashtag max. No fluff.',
//       linkedin:        'Professional. 300-600 chars. Insight-led. End with a question. No hashtag spam.',
//       youtube:         'SEO-optimised description (300+ chars). Front-load keywords. Include chapters if tutorial.',
//       threads:         'Conversational. Under 500 chars. No hashtag walls.',
//       bluesky:         'Under 300 chars. Thoughtful community tone.',
//       whatsapp_status: 'Ultra-short. Under 100 chars. Max 1 emoji. No hashtags.',
//     };

//     const result = await this.ai.generateJson<{
//       caption: string;
//       hook: string;
//       hashtags: string[];
//       callToAction: string;
//       pidginCaption?: string;
//       bestPostTime: string;
//       engagementTip: string;
//     }>(
//       `You are a Nigerian social media strategist who understands Lagos culture, Pidgin English, 
// and what goes viral in the Nigerian digital space. Always respond with valid JSON only.`,
//       `Generate a ${platform} caption for a Nigerian business.
// Topic: ${dto.topic}
// Platform guidelines: ${platformGuide[platform]}
// Brand voice: ${dto.brandVoice ?? 'friendly, professional, Nigerian'}
// Language: ${language}
// Hashtag count: ${dto.hashtagCount ?? 10}
// ${dto.includePidgin ? 'Also include a Pidgin English version in pidginCaption field.' : ''}

// Return JSON: { caption, hook (first sentence only), hashtags: [string], callToAction, 
// ${dto.includePidgin ? 'pidginCaption,' : ''} bestPostTime (e.g. "7-9pm WAT"), engagementTip }`,
//       { task: language !== 'english' ? 'nigerian-language' : 'creative', temperature: 0.8 },
//     );

//     await this.redis.setex(cacheKey, 1800, JSON.stringify(result.content)); // 30 min cache
//     await this.logActivity(userId, 'social.caption_generated', { platform, topic: dto.topic });

//     return result.content;
//   }

//   // ─── Schedule post ───────────────────────────────────────────────────────────

//   async schedulePost(userId: string, dto: SchedulePostDto) {
//     const scheduledAt = dto.scheduledAt
//       ? new Date(dto.scheduledAt)
//       : this.getBestPostTime(dto.platforms[0] ?? 'instagram');

//     const delay = scheduledAt.getTime() - Date.now();
//     if (delay < 0) {
//       // Post immediately if in the past
//       scheduledAt.setTime(Date.now() + 5000);
//     }

//     const bullJob = await this.socialQueue.add(
//       'post',
//       {
//         userId,
//         content: dto.content,
//         platforms: dto.platforms,
//         mediaUrls: dto.mediaUrls ?? [],
//         scheduledAt: scheduledAt.toISOString(),
//       } satisfies PostJobPayload,
//       {
//         delay: Math.max(delay, 0),
//         attempts: 3,
//         backoff: { type: 'exponential', delay: 60_000 },
//       },
//     );

//     await this.logActivity(userId, 'social.post_scheduled', {
//       platforms: dto.platforms,
//       scheduledAt: scheduledAt.toISOString(),
//       bullJobId: bullJob.id,
//     });

//     return {
//       status: 'scheduled',
//       bullJobId: bullJob.id,
//       platforms: dto.platforms,
//       scheduledAt: scheduledAt.toISOString(),
//       message: `Post scheduled for ${scheduledAt.toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT`,
//     };
//   }

//   // ─── Bulk content generation ─────────────────────────────────────────────────

//   async generateBulkContent(userId: string, dto: BulkContentDto) {
//     const result = await this.ai.generateJson<{
//       posts: Array<{
//         platform: string;
//         caption: string;
//         hashtags: string[];
//         hook: string;
//         callToAction: string;
//         contentType: 'educational' | 'promotional' | 'entertaining' | 'behind_the_scenes' | 'testimonial' | 'trending';
//       }>;
//     }>(
//       'You are a Nigerian social media content strategist. Respond with valid JSON only.',
//       `Generate ${dto.count} unique social media posts for a Nigerian business.
// Business: ${dto.businessDescription}
// Platforms: ${(dto.platforms ?? ['instagram']).join(', ')}
// Language: ${dto.language ?? 'english'}

// Return JSON: { posts: [{ platform, caption, hashtags: [string], hook, callToAction, contentType }] }
// Mix content types: educational, promotional, entertaining, behind_the_scenes, testimonial, trending.
// Include at least 2 Pidgin English posts. Make each feel completely distinct.
// Reference Nigerian context: local holidays, Nigerian slang, ₦ pricing, WhatsApp sharing culture.`,
//       { task: 'creative', temperature: 0.85, maxTokens: 4000 },
//     );

//     await this.logActivity(userId, 'social.bulk_content_generated', { count: dto.count });
//     return result.content;
//   }

//   // ─── Auto-reply / Receptionist config ────────────────────────────────────────

//   async configureAutoReply(userId: string, dto: AutoReplyConfigDto) {
//     const existing = await this.prisma.receptionistClient.findUnique({ where: { userId } });

//     const upsertData = {
//       faqData: dto.faqData,
//       greetingMessage: dto.greetingMessage,
//       escalationTriggers: dto.escalationKeywords ?? [],
//       autoReplyEnabled: true,
//       appointmentEnabled: dto.appointmentEnabled ?? false,
//       calendarUrl: dto.calendarUrl ?? null,
//       ...(dto.channel === 'whatsapp'        && { whatsappEnabled: true }),
//       ...(dto.channel === 'instagram_dm'    && { igPageId: 'pending_connection' }),
//       ...(dto.channel === 'facebook_message'&& { fbPageId: 'pending_connection' }),
//     };

//     if (existing) {
//       await this.prisma.receptionistClient.update({ where: { userId }, data: upsertData });
//     } else {
//       await this.prisma.receptionistClient.create({
//         data: {
//           userId,
//           businessName: 'My Business',
//           businessContext: `Auto-reply for ${dto.channel}`,
//           ...upsertData,
//         },
//       });
//     }

//     await this.logActivity(userId, 'social.auto_reply_configured', { channel: dto.channel });

//     return {
//       status: 'active',
//       channel: dto.channel,
//       faqCount: Object.keys(dto.faqData).length,
//       appointmentEnabled: dto.appointmentEnabled ?? false,
//       nextStep: dto.channel === 'whatsapp'
//         ? 'Connect your WhatsApp Business number in Settings → Integrations → WhatsApp'
//         : `Connect your ${dto.channel === 'instagram_dm' ? 'Instagram' : 'Facebook'} page in Settings → Integrations`,
//     };
//   }

//   // ─── Trending topics ─────────────────────────────────────────────────────────

//   async getTrendingTopics() {
//     const cacheKey = 'social:trending:nigeria';
//     const cached = await this.redis.get(cacheKey);
//     if (cached) return JSON.parse(cached) as Record<string, unknown>;

//     // Pull Twitter/X trending via API if configured, else AI-generated suggestions
//     const xBearerToken = this.config.get<string>('TWITTER_BEARER_TOKEN', '');

//     if (xBearerToken) {
//       try {
//         const { data } = await firstValueFrom(
//           this.http.get('https://api.twitter.com/1.1/trends/place.json?id=23424908', { // Nigeria WOEID
//             headers: { Authorization: `Bearer ${xBearerToken}` },
//           }),
//         );
//         const trends = (data as Array<{ trends: Array<{ name: string; tweet_volume: number }> }>)[0]?.trends ?? [];
//         const result = {
//           source: 'twitter',
//           trending: trends.slice(0, 10).map((t) => ({ topic: t.name, volume: t.tweet_volume ?? 0 })),
//           updatedAt: new Date().toISOString(),
//         };
//         await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
//         return result;
//       } catch (err) {
//         this.logger.warn(`Twitter trends API failed: ${String(err)} — falling back to AI suggestions`);
//       }
//     }

//     // AI-generated Nigerian content ideas as fallback
//     const result = await this.ai.generateJson<{
//       trending: Array<{ topic: string; platform: string; category: string }>;
//       contentIdeas: string[];
//     }>(
//       'You are a Nigerian social media trends analyst. Respond with valid JSON only.',
//       `Generate 10 trending content topic ideas relevant to Nigerian audiences right now.
// Consider: Nigerian business culture, current economic climate, tech/fintech space, 
// creator economy, upcoming Nigerian holidays, Lagos/Abuja lifestyle, JAPA discourse.

// Return JSON: {
//   trending: [{ topic, platform (instagram|tiktok|twitter), category }],
//   contentIdeas: [5 specific post ideas for Nigerian SMEs]
// }`,
//       { task: 'nigerian-language', temperature: 0.9, cacheTtl: 3600 },
//     );

//     const response = { source: 'ai', ...result.content, updatedAt: new Date().toISOString() };
//     await this.redis.setex(cacheKey, 3600, JSON.stringify(response));
//     return response;
//   }

//   // ─── Analytics summary ───────────────────────────────────────────────────────

//   async getAnalyticsSummary(userId: string) {
//     const [postsScheduled, autoReplies, leads] = await Promise.all([
//       this.prisma.activityLog.count({ where: { userId, action: 'social.post_scheduled' } }),
//       this.prisma.conversationLog.count({ where: { client: { userId } } }),
//       this.prisma.leadCapture.count({ where: { client: { userId } } }),
//     ]);

//     return {
//       postsScheduled,
//       autoRepliesHandled: autoReplies,
//       leadsGenerated: leads,
//       connectNote: 'Connect Meta Business Suite in Settings → Integrations for full platform analytics (reach, impressions, follower growth).',
//     };
//   }

//   // ─── WhatsApp broadcast (direct send via Meta API) ────────────────────────────

//   async sendWhatsAppBroadcast(
//     userId: string,
//     phoneNumberId: string,
//     recipients: string[],
//     message: string,
//   ) {
//     const client = await this.prisma.receptionistClient.findUnique({
//       where: { userId },
//       select: { whatsappNumber: true, isActive: true },
//     });

//     if (!client?.isActive) {
//       return { sent: 0, failed: recipients.length, error: 'WhatsApp not configured' };
//     }

//     // Send in batches of 10 with 1s delay to respect Meta rate limits
//     let sent = 0;
//     let failed = 0;

//     for (let i = 0; i < recipients.length; i += 10) {
//       const batch = recipients.slice(i, i + 10);

//       await Promise.allSettled(
//         batch.map(async (to) => {
//           try {
//             await firstValueFrom(
//               this.http.post(
//                 `https://graph.facebook.com/${this.waApiVersion}/${phoneNumberId}/messages`,
//                 {
//                   messaging_product: 'whatsapp',
//                   recipient_type: 'individual',
//                   to,
//                   type: 'text',
//                   text: { preview_url: false, body: message },
//                 },
//                 { headers: { Authorization: `Bearer ${this.waToken}` } },
//               ),
//             );
//             sent++;
//           } catch (err) {
//             this.logger.warn(`WA broadcast failed for ${to}: ${String(err)}`);
//             failed++;
//           }
//         }),
//       );

//       if (i + 10 < recipients.length) {
//         await new Promise((r) => setTimeout(r, 1000)); // rate limit pause
//       }
//     }

//     await this.logActivity(userId, 'social.whatsapp_broadcast_sent', { sent, failed, total: recipients.length });
//     return { sent, failed, total: recipients.length };
//   }

//   // ─── Content repurpose ───────────────────────────────────────────────────────

//   async repurposeContent(userId: string, input: { sourceContent: string; targetPlatforms: SocialPlatform[] }) {
//     const result = await this.ai.generateJson<{
//       repurposed: Array<{ platform: string; content: string; hashtags: string[]; format: string }>;
//     }>(
//       'You are a Nigerian content repurposing expert. Valid JSON only.',
//       `Repurpose this content for multiple Nigerian social media platforms.
// Original content: "${input.sourceContent}"
// Target platforms: ${input.targetPlatforms.join(', ')}

// Return JSON: { repurposed: [{ platform, content (adapted for each platform's style and limits), hashtags: [], format (post|reel_script|thread|article) }] }
// Adapt tone, length, and format for each platform. Add Pidgin flair for Instagram/TikTok.`,
//       { task: 'creative', temperature: 0.8 },
//     );

//     await this.logActivity(userId, 'social.content_repurposed', { targetPlatforms: input.targetPlatforms });
//     return result.content;
//   }

//   // ─── Helpers ─────────────────────────────────────────────────────────────────

//   private getBestPostTime(platform: SocialPlatform): Date {
//     const bestHours: Partial<Record<SocialPlatform, number>> = {
//       instagram: 19, tiktok: 21, facebook: 12, twitter: 8,
//       linkedin: 9, youtube: 15, threads: 20, bluesky: 18, whatsapp_status: 7,
//     };
//     const d = new Date();
//     d.setHours(bestHours[platform] ?? 19, 0, 0, 0);
//     if (d < new Date()) d.setDate(d.getDate() + 1);
//     return d;
//   }

//   private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
//     await this.prisma.activityLog.create({
//       data: { userId, action, productSlug: 'social-media-manager', metadata },
//     }).catch(() => {}); // non-critical — never throw on analytics
//   }
// }