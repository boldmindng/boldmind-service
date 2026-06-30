// src/modules/automation/queue/email-campaign.processor.ts
//
// Migrated from @nestjs/bull → @nestjs/bullmq. Queue renamed from the
// hardcoded 'email-campaigns' to QUEUES.EMAIL_NOTIFICATIONS ('email-notifications'),
// matching the canonical queue map. This processor now ALSO handles the
// 'broadcast-email' job that NotificationService.broadcastEmail() queues —
// previously that job had nowhere to land because NotificationService queued
// it onto an undeclared 'notifications' queue with no consumer at all.

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { QUEUES, JOBS } from '../../../common/constants/queues';

interface SendBatchJobData {
  userId: string;
  subject: string;
  htmlBody: string;
  recipients: string[];
}

interface ExpiryReminderJobData {
  email: string;
  name: string;
  productSlug: string;
  expiresAt: Date;
}

interface BroadcastEmailJobData {
  subject: string;
  html: string;
  segment: 'all' | 'pro' | 'free';
}

type EmailJobData = SendBatchJobData | ExpiryReminderJobData | BroadcastEmailJobData;

@Processor(QUEUES.EMAIL_NOTIFICATIONS)
export class EmailCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailCampaignProcessor.name);
  private readonly resend: Resend;
  private readonly FROM_EMAIL: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.FROM_EMAIL = config.get<string>('FROM_EMAIL', 'hello@boldmind.ng');
  }

  async process(job: Job<EmailJobData>): Promise<any> {
    switch (job.name) {
      case JOBS.EMAIL.SEND_BATCH:
        return this.handleEmailBatch(job as Job<SendBatchJobData>);
      case JOBS.EMAIL.EXPIRY_REMINDER:
        return this.handleExpiryReminder(job as Job<ExpiryReminderJobData>);
      case JOBS.EMAIL.BROADCAST:
        return this.handleBroadcastEmail(job as Job<BroadcastEmailJobData>);
      default:
        this.logger.warn(`Unhandled job "${job.name}" on queue "${QUEUES.EMAIL_NOTIFICATIONS}"`);
        return null;
    }
  }

  private async handleEmailBatch(job: Job<SendBatchJobData>) {
    const { subject, htmlBody, recipients } = job.data;
    this.logger.log(`Sending email batch: ${recipients.length} recipients`);

    let sent = 0;
    let failed = 0;

    for (const email of recipients) {
      try {
        await this.resend.emails.send({
          from: `BoldMind <${this.FROM_EMAIL}>`,
          to: email,
          subject,
          html: htmlBody,
        });
        sent++;
        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 100));
      } catch (err: any) {
        this.logger.warn(`Email failed to ${email}:`, err.message);
        failed++;
      }
    }

    this.logger.log(`Batch complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  }

  private async handleExpiryReminder(job: Job<ExpiryReminderJobData>) {
    const { email, name, productSlug, expiresAt } = job.data;
    const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);

    await this.resend.emails.send({
      from: `BoldMind <${this.FROM_EMAIL}>`,
      to: email,
      subject: `⚠️ Your ${productSlug} subscription expires in ${daysLeft} days`,
      html: `
        <h2>Hi ${name},</h2>
        <p>Your <strong>${productSlug}</strong> subscription expires in <strong>${daysLeft} days</strong>.</p>
        <p>Renew now to keep your access without interruption.</p>
        <p>
          <a href="https://boldmind.ng/dashboard/subscriptions" 
             style="background:#4F46E5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">
            Renew Subscription →
          </a>
        </p>
        <p style="color:#6B7280;font-size:14px;">The BoldMind Team</p>
      `,
    });
  }

  private async handleBroadcastEmail(job: Job<BroadcastEmailJobData>) {
    const { subject, html, segment } = job.data;
    this.logger.log(`Broadcast email starting — segment: ${segment}`);

    // NOTE: this only logs/acknowledges the job for now. Resolving the actual
    // recipient list for `segment` ('all' | 'pro' | 'free') needs a Subscription
    // query this processor doesn't have access to yet (no PrismaService injected
    // here). Wire that in, then fan this out into handleEmailBatch-style sends —
    // that's a follow-up to the queue centralization, not part of it.
    return { queued: true, segment };
  }
}