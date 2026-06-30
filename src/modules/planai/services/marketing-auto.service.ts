import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { PlanAIJobService } from './planai-job.service';
import { CreateCampaignDto, CreateDripSequenceDto, CreateWhatsAppBroadcastDto } from '../dto/all-planai.dto';
import { PlanAIJobType } from '@prisma/client';
import { QUEUES } from '../../../common/constants/queues';
// ...

@Injectable()
export class MarketingAutoService {
  private readonly logger = new Logger(MarketingAutoService.name);

  private readonly resendApiKey: string;
  private readonly termiiApiKey: string;
  private readonly termiiSenderId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly jobService: PlanAIJobService,
    @InjectQueue(QUEUES.MARKETING_AUTOMATION) private readonly emailQueue: Queue,

  ) {
    this.resendApiKey    = this.config.get<string>('RESEND_API_KEY', '');
    this.termiiApiKey    = this.config.get<string>('TERMII_API_KEY', '');
    this.termiiSenderId  = this.config.get<string>('TERMII_SENDER_ID', 'BoldmindNG');
  }

  // ─── Create campaign ─────────────────────────────────────────────────────────

  async createCampaign(userId: string, dto: CreateCampaignDto) {
    // First generate AI-improved copy via job
    const jobResult = await this.jobService.createJob(userId, {
      type: PlanAIJobType.MARKETING_CAMPAIGN,
      input: {
        name: dto.name,
        channel: dto.channel,
        content: dto.content,
        subject: dto.subject,
        festiveCampaign: dto.festiveCampaign,
        segmentFilter: dto.segmentFilter,
      },
      productSlug: 'marketing-automation',
    });

    // If scheduled, enqueue delivery
    if (dto.scheduledAt) {
      const delay = new Date(dto.scheduledAt).getTime() - Date.now();
      if (delay > 0) {
        await this.emailQueue.add(
          `campaign-${dto.channel}`,
          { userId, jobId: jobResult.jobId, channel: dto.channel, scheduledAt: dto.scheduledAt },
          { delay, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
        );
      }
    }

    await this.logActivity(userId, 'marketing.campaign_created', {
      name: dto.name,
      channel: dto.channel,
      scheduledAt: dto.scheduledAt ?? 'immediate',
      jobId: jobResult.jobId,
    });

    return {
      ...jobResult,
      channel: dto.channel,
      name: dto.name,
      scheduledAt: dto.scheduledAt ?? 'immediate',
      note: dto.channel === 'whatsapp'
        ? 'WhatsApp Business API must be connected in Settings → Integrations → WhatsApp.'
        : dto.channel === 'sms'
        ? 'SMS delivery via Termii. Ensure your Termii API key is configured.'
        : 'Email delivery via Resend.',
    };
  }

  // ─── Drip sequence ────────────────────────────────────────────────────────────

  async createDripSequence(userId: string, dto: CreateDripSequenceDto) {
    const sequenceId = `drip_${Date.now().toString(36)}`;

    await this.logActivity(userId, 'marketing.drip_created', {
      sequenceId,
      name: dto.name,
      trigger: dto.trigger,
      channel: dto.channel,
      stepCount: dto.steps.length,
    });

    // Enqueue each step with cumulative delay
    let cumulativeDelayMs = 0;
    for (const step of dto.steps) {
      cumulativeDelayMs += step.delayHours * 60 * 60 * 1000;
      await this.emailQueue.add(
        `drip-step-${dto.channel}`,
        {
          userId,
          sequenceId,
          trigger: dto.trigger,
          channel: dto.channel,
          content: step.content,
          subject: step.subject,
        },
        {
          delay: cumulativeDelayMs,
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
          jobId: `${sequenceId}-step${dto.steps.indexOf(step) + 1}`,
        },
      );
    }

    return {
      sequenceId,
      name: dto.name,
      trigger: dto.trigger,
      channel: dto.channel,
      stepCount: dto.steps.length,
      status: 'active',
      totalDelayHours: dto.steps.reduce((s, step) => s + step.delayHours, 0),
    };
  }

  // ─── Direct email send via Resend ─────────────────────────────────────────────

  async sendEmail(input: {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
  }) {
    if (!this.resendApiKey) {
      this.logger.warn('RESEND_API_KEY not configured — email not sent');
      return { sent: false, reason: 'Resend API key not configured' };
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          'https://api.resend.com/emails',
          {
            from: input.from ?? `BoldmindNG <noreply@boldmind.ng>`,
            to: Array.isArray(input.to) ? input.to : [input.to],
            subject: input.subject,
            html: input.html,
            reply_to: input.replyTo,
          },
          { headers: { Authorization: `Bearer ${this.resendApiKey}` } },
        ),
      );
      this.logger.log(`Email sent via Resend: id=${(data as { id: string }).id}`);
      return { sent: true, messageId: (data as { id: string }).id };
    } catch (err) {
      this.logger.error(`Resend email failed: ${String(err)}`);
      throw err;
    }
  }

  // ─── SMS via Termii ───────────────────────────────────────────────────────────

  async sendSms(to: string | string[], message: string) {
    if (!this.termiiApiKey) {
      this.logger.warn('TERMII_API_KEY not configured — SMS not sent');
      return { sent: false, reason: 'Termii API key not configured' };
    }

    const recipients = Array.isArray(to) ? to : [to];

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          'https://api.ng.termii.com/api/sms/send/bulk',
          {
            to: recipients,
            from: this.termiiSenderId,
            sms: message,
            type: 'plain',
            channel: 'generic',
            api_key: this.termiiApiKey,
          },
        ),
      );
      this.logger.log(`SMS sent via Termii: ${recipients.length} recipients`);
      return { sent: true, data };
    } catch (err) {
      this.logger.error(`Termii SMS failed: ${String(err)}`);
      throw err;
    }
  }

  // ─── Abandoned cart recovery ──────────────────────────────────────────────────

  async triggerAbandonedCartRecovery(userId: string, input: {
    customerPhone: string;
    customerName: string;
    cartItems: Array<{ name: string; priceNGN: number }>;
    storeSlug: string;
    phoneNumberId: string;
  }) {
    const totalNGN = input.cartItems.reduce((s, i) => s + i.priceNGN, 0);
    const itemList = input.cartItems.map((i) => `• ${i.name} — ₦${i.priceNGN.toLocaleString('en-NG')}`).join('\n');

    const message = `Hi ${input.customerName}! 👋

You left these items in your cart:
${itemList}

Total: ₦${totalNGN.toLocaleString('en-NG')}

Complete your order here: https://boldmind.ng/store/${input.storeSlug}/checkout

Need help? Reply to this message 🙂`;

    // Queue for sending — don't block the caller
    await this.emailQueue.add(
      'abandoned-cart-whatsapp',
      { userId, phone: input.customerPhone, message, phoneNumberId: input.phoneNumberId },
      { delay: 0, attempts: 2 },
    );

    await this.logActivity(userId, 'marketing.abandoned_cart_triggered', {
      customerPhone: input.customerPhone,
      itemCount: input.cartItems.length,
      totalNGN,
    });

    return { queued: true, totalNGN };
  }

  // ─── Customer segmentation ────────────────────────────────────────────────────

  async getCustomerSegments(userId: string) {
    const [orders, leads] = await Promise.all([
      this.prisma.order.findMany({
        where: { store: { userId } },
        select: { customerEmail: true, customerPhone: true, totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      this.prisma.leadCapture.findMany({
        where: { client: { userId } },
        select: { email: true, phone: true, isQualified: true, createdAt: true },
        take: 500,
      }),
    ]);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    return {
      segments: {
        activeCustomers: orders.filter((o) => o.createdAt >= thirtyDaysAgo).length,
        dormantCustomers: orders.filter((o) => o.createdAt < ninetyDaysAgo).length,
        highValueCustomers: orders.filter((o) => o.totalAmount > 50_000_00).length, // > ₦50k
        qualifiedLeads: leads.filter((l) => l.isQualified).length,
        totalLeads: leads.length,
        totalCustomers: new Set(orders.map((o) => o.customerEmail).filter(Boolean)).size,
      },
      tip: 'Use segments to target campaigns. High-value customers respond best to exclusive offers.',
    };
  }

  // ─── Festive campaign templates ───────────────────────────────────────────────

  async getFestiveTemplates() {
    return {
      templates: [
        { slug: 'ramadan', name: 'Ramadan Mubarak 🌙', channel: 'whatsapp', preview: 'Ramadan Kareem! This blessed month, we\'re offering...' },
        { slug: 'sallah_eid', name: 'Sallah Eid Celebration 🐑', channel: 'whatsapp', preview: 'Eid Mubarak to you and your family! Celebrate with...' },
        { slug: 'christmas', name: 'Christmas Promo 🎄', channel: 'email', preview: 'Merry Christmas! We\'re making your celebration special...' },
        { slug: 'new_year', name: 'New Year Offer 🎉', channel: 'both', preview: 'Happy New Year! Start the year right with...' },
        { slug: 'back_to_school', name: 'Back to School 📚', channel: 'whatsapp', preview: 'School don resume! Get ready with...' },
        { slug: 'valentines', name: "Valentine's Day 💝", channel: 'instagram', preview: 'Show your love with...' },
        { slug: 'independence_day', name: 'Independence Day 🇳🇬', channel: 'instagram', preview: 'Happy Independence Day Nigeria! Celebrating with...' },
        { slug: 'easter', name: 'Easter Promo 🐣', channel: 'email', preview: 'Happy Easter! Celebrate the season with...' },
      ],
    };
  }

  async getCampaigns(userId: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, action: 'marketing.campaign_created' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { campaigns: logs.map((l) => ({ ...(l.metadata as object), createdAt: l.createdAt })) };
  }

  // ─── Send campaign immediately ────────────────────────────────────────────────

  async sendCampaign(campaignId: string, userId: string) {
    const job = await this.jobService.createJob(userId, {
      type: PlanAIJobType.MARKETING_CAMPAIGN,
      input: { campaignId, action: 'send_now' },
      productSlug: 'marketing-automation',
    });
    this.logger.log(`Campaign ${campaignId} queued for immediate send — job ${job.jobId}`);
    return { queued: true, jobId: job.jobId, campaignId };
  }

  // ─── Generate subject lines ───────────────────────────────────────────────────

  async generateSubjectLines(dto: {
    topic: string;
    brand: string;
    tone?: string;
  }): Promise<{ subjectLines: string[] }> {
    const result = await this.ai.generateJson<{ subjectLines: string[] }>(
      'You are an email marketing expert for Nigerian businesses. Return valid JSON only.',
      `Generate 5 high-converting email subject lines for a Nigerian audience.
Topic: ${dto.topic}
Brand: ${dto.brand}
Tone: ${dto.tone ?? 'friendly and professional'}
Rules: include curiosity, urgency, or personalisation. Mix English and Pidgin options.
Return JSON: { subjectLines: string[] }`,
      { task: 'creative', temperature: 0.7 },
    );
    return result.content;
  }

  // ─── Generate email copy ──────────────────────────────────────────────────────

  async generateEmailCopy(dto: {
    topic: string;
    cta: string;
    audience: string;
    tone?: string;
  }): Promise<{ subject: string; body: string; previewText: string }> {
    const result = await this.ai.generateJson<{
      subject: string;
      body: string;
      previewText: string;
    }>(
      'You are an email copywriter for Nigerian SMEs. Return valid JSON only.',
      `Write a marketing email for a Nigerian business.
Topic: ${dto.topic}
CTA: ${dto.cta}
Target audience: ${dto.audience}
Tone: ${dto.tone ?? 'warm and direct'}
Return JSON: { subject, body (full HTML), previewText (max 90 chars) }`,
      { task: 'creative', temperature: 0.65 },
    );
    return result.content;
  }

  // ─── WhatsApp broadcast ───────────────────────────────────────────────────────

  async createWhatsAppBroadcast(userId: string, dto: CreateWhatsAppBroadcastDto) {
    const job = await this.jobService.createJob(userId, {
      type: PlanAIJobType.MARKETING_CAMPAIGN,
      input: {
        channel: 'whatsapp',
        message: dto.message,
        segmentFilter: dto.segmentFilter,
        scheduledAt: dto.scheduledAt,
        festiveCampaign: dto.festiveCampaign,
      },
      productSlug: 'marketing-automation',
    });
    await this.logActivity(userId, 'marketing.whatsapp_broadcast_created', {
      jobId: job.jobId,
      scheduledAt: dto.scheduledAt ?? 'immediate',
    });
    return {
      jobId: job.jobId,
      channel: 'whatsapp',
      scheduledAt: dto.scheduledAt ?? 'immediate',
      message: 'WhatsApp broadcast queued',
    };
  }

  // ─── Campaign analytics ───────────────────────────────────────────────────────

  async getCampaignAnalytics(campaignId: string, userId: string) {
    const cacheKey = `marketing:analytics:${campaignId}`;
    const cached = await this.redis.cache.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    // Fallback: check activity logs for this campaign
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, action: { startsWith: 'marketing.' } },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    const data = {
      campaignId,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      unsubscribed: 0,
      openRate: 0,
      clickRate: 0,
      lastActivity: logs[0]?.createdAt ?? null,
      note: 'Analytics populate after first send',
    };
    await this.redis.cache.setex(cacheKey, 300, JSON.stringify(data));
    return data;
  }

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'marketing-automation', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}