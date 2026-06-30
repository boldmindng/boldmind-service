
import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import { QUEUES, JOBS } from '../../common/constants/queues';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  private readonly N8N_BASE: string;
  private readonly N8N_TOKEN: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ai: AiService,
    @InjectQueue(QUEUES.SOCIAL_PUBLISHING) private readonly socialQueue: Queue,
    @InjectQueue(QUEUES.EMAIL_NOTIFICATIONS) private readonly emailQueue: Queue,
    @InjectQueue(QUEUES.AI_GENERATION) private readonly aiQueue: Queue,
  ) {
    this.N8N_BASE = config.get<string>('N8N_BASE_URL', 'http://n8n:5678');
    this.N8N_TOKEN = config.get<string>('N8N_API_KEY', '');
  }

  // ── n8n webhook trigger ───────────────────────────────────

  async triggerN8NWorkflow(webhookPath: string, payload: any): Promise<any> {
    try {
      const { data } = await axios.post(
        `${this.N8N_BASE}/webhook/${webhookPath}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.N8N_TOKEN}`,
          },
          timeout: 10000,
        },
      );
      this.logger.log(`n8n workflow triggered: ${webhookPath}`);
      return data;
    } catch (err: any) {
      this.logger.error(`n8n webhook failed (${webhookPath}):`, err.message);
      // Don't throw — automation failures shouldn't break main flow
      return null;
    }
  }

  // ── Social Content Factory ────────────────────────────────

   async scheduleSocialPost(userId: string, dto: {
    platforms: string[]; content: string; mediaUrls?: string[]; scheduledAt: Date;
    caption?: string; hashtags?: string[];
  }) {
    const delay = dto.scheduledAt.getTime() - Date.now();
    if (delay < 0) throw new Error('Scheduled time must be in the future');

    const job = await this.socialQueue.add(
      JOBS.SOCIAL.POST,
      { userId, ...dto },
      { delay }, // attempts/backoff now come from QUEUE_DEFAULT_JOB_OPTIONS[SOCIAL_PUBLISHING]
    );

    this.logger.log(`Social post scheduled for ${dto.scheduledAt.toISOString()} (job ${job.id})`);
    return { jobId: job.id, scheduledAt: dto.scheduledAt };
  }

//   async generateContentCalendar(userId: string, input: {
//     businessName: string;
//     industry: string;
//     platforms: string[];
//     weeks: number;
//     themes?: string[];
//   }) {
//     const calendar = await this.ai.structuredChat<any>(
//       `You are a Nigerian social media strategist. Create content calendars optimized for Nigerian audiences.
// Key dates: Nigerian holidays (Independence Day Oct 1, Democracy Day June 12), Islamic/Christian calendars, 
// local trends like SAPA season, JAPA discourse, market days.`,
//       `Create a ${input.weeks}-week content calendar for ${input.businessName} (${input.industry}).
// Platforms: ${input.platforms.join(', ')}
// Themes: ${input.themes?.join(', ') || 'auto-suggest'}

// Return JSON with: weeks (array), each week having: theme, posts (array of { day, platform, type, caption, hashtags, bestTimeToPost }).
// Include at least 1 Pidgin English post per week.`,
//     );

//     return calendar;
//   }

  async bulkGenerateCaptions(userId: string, input: {
    businessName: string;
    products: string[];
    platform: string;
    tone: string;
    count: number;
  }) {
    const captions = await this.ai.structuredChat<any>(
      'You are a Nigerian social media copywriter who understands Pidgin, local slang, and viral content.',
      `Generate ${input.count} unique ${input.platform} captions for ${input.businessName}.
Products/services: ${input.products.join(', ')}
Tone: ${input.tone}

Return JSON with: captions (array of { text, hashtags, emojis, callToAction, type: "promotional|educational|entertainment" }).`,
    );

    return captions;
  }

  // ── Email Campaign automation ─────────────────────────────

   async scheduleEmailCampaign(userId: string, dto: {
    subject: string; htmlBody: string; recipientEmails: string[];
    scheduledAt?: Date; batchSize?: number;
  }) {
    const batchSize = dto.batchSize || 100;
    const batches = [];
    for (let i = 0; i < dto.recipientEmails.length; i += batchSize) {
      batches.push(dto.recipientEmails.slice(i, i + batchSize));
    }

    const jobs = await Promise.all(
      batches.map((batch, idx) =>
        this.emailQueue.add(
          JOBS.EMAIL.SEND_BATCH,
          { userId, subject: dto.subject, htmlBody: dto.htmlBody, recipients: batch },
          {
            delay: dto.scheduledAt
              ? dto.scheduledAt.getTime() - Date.now() + idx * 5000
              : idx * 5000, // stagger only — attempts now from defaults
          },
        ),
      ),
    );

    return { batches: batches.length, jobs: jobs.map((j) => j.id), totalRecipients: dto.recipientEmails.length };
  }


  // ── Email Scraper ─────────────────────────────────────────

  async scrapeEmails(userId: string, dto: {
    targetUrl?: string; linkedinSearchQuery?: string; naijaDirectory?: string; limit?: number;
  }) {
    const jobId = await this.aiQueue.add(
      JOBS.AI.EMAIL_SCRAPE,
      { userId, ...dto, limit: dto.limit || 50 },
      // attempts removed — comes from QUEUE_DEFAULT_JOB_OPTIONS[AI_GENERATION]
    );

    return { jobId: jobId.id, status: 'QUEUED', message: 'Email scraping started. Results will be ready in 2-5 minutes.' };
  }

  async verifyEmail(email: string): Promise<{ valid: boolean; reason?: string }> {
    // Basic regex + MX record check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return { valid: false, reason: 'Invalid format' };

    try {
      // Check Hunter.io if configured
      const hunterKey = this.config.get<string>('HUNTER_IO_API_KEY');
      if (hunterKey) {
        const { data } = await axios.get(
          `https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${hunterKey}`,
        );
        return {
          valid: data.data.result === 'deliverable',
          reason: data.data.result,
        };
      }
      return { valid: true };
    } catch {
      return { valid: true }; // Fallback to optimistic
    }
  }

  // ── Cron jobs ─────────────────────────────────────────────

   @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async dailySubscriptionCheck() {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const expiringSoon = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lte: threeDaysFromNow, gte: new Date() } },
      include: { user: { select: { email: true, name: true } } },
    });

    for (const sub of expiringSoon) {
      await this.emailQueue.add(JOBS.EMAIL.EXPIRY_REMINDER, {
        email: sub.user.email,
        name: sub.user.name,
        productSlug: sub.productSlug,
        expiresAt: sub.currentPeriodEnd,
      });
    }

    this.logger.log(`Expiry reminders queued for ${expiringSoon.length} subscriptions`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanExpiredTokens() {
    const deleted = await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true }] },
    });
    this.logger.log(`Cleaned ${deleted.count} expired/revoked tokens`);
  }

  @Cron('0 6 * * 1') // Every Monday 6AM
  async weeklyAnalyticsDigest() {
    await this.triggerN8NWorkflow('weekly-analytics-digest', { triggeredAt: new Date() });
  }

  // ── Trigger management ────────────────────────────────────

  async getQueueStats() {
    const [social, email, ai] = await Promise.all([
      this.getQueueInfo(this.socialQueue),
      this.getQueueInfo(this.emailQueue),
      this.getQueueInfo(this.aiQueue),
    ]);
    return { social, email, ai };
  }

  private async getQueueInfo(queue: Queue) {
    const [waiting, active, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { name: queue.name, waiting, active, completed, failed };
  }
}