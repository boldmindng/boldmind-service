// src/modules/notification/notification.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpService } from '@nestjs/axios';
import { Queue } from 'bullmq';
import { Resend } from 'resend';
import { firstValueFrom } from 'rxjs';
import * as webpush from 'web-push';
import { PrismaService } from '../../database/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { SendPushDto } from './dto/send-push.dto';
import { NotificationType } from '@prisma/client';
import { QUEUES, JOBS } from '../../common/constants/queues';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  // WhatsApp Graph API
  private readonly metaApiVersion = 'v19.0';
  private readonly defaultWaToken: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private http: HttpService,
    @InjectQueue(QUEUES.EMAIL_NOTIFICATIONS) private emailQueue: Queue,
    @InjectQueue(QUEUES.PUSH_NOTIFICATIONS) private pushQueue: Queue,
  ) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'hello@boldmind.ng');
    this.defaultWaToken = this.config.get<string>('META_WHATSAPP_TOKEN', '');

    webpush.setVapidDetails(
      `mailto:${this.fromEmail}`,
      this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  // ─── EMAIL (Resend) ──────────────────────────────────────────────────────────

  async sendEmail(dto: SendEmailDto) {
    try {
      const result = await this.resend.emails.send({
        from: dto.from ?? this.fromEmail,
        to: Array.isArray(dto.to) ? dto.to : [dto.to],
        subject: dto.subject,
        html: dto.html,
        text: dto.text,
        replyTo: dto.replyTo,
        tags: dto.tags,
      });

      await this.logNotification({
        userId: dto.userId,
        type: NotificationType.EMAIL,
        title: dto.subject,
        body: dto.text ?? dto.subject,
        meta: { resendId: result.data?.id, to: dto.to },
      });

      return result;
    } catch (err) {
      this.logger.error('Resend email failed', err);
      throw err;
    }
  }

  async sendWelcomeEmail(userId: string, name: string, email: string) {
    return this.sendEmail({
      userId,
      to: email,
      subject: `Welcome to BoldMind, ${name}! 🚀`,
      html: this.buildWelcomeTemplate(name),
      text: `Welcome to BoldMind, ${name}! Your account is ready.`,
    });
  }

  async sendPasswordResetEmail(email: string, resetUrl: string) {
    return this.sendEmail({
      to: email,
      subject: 'Reset Your BoldMind Password',
      html: this.buildPasswordResetTemplate(resetUrl),
      text: `Reset your password here: ${resetUrl}`,
    });
  }

  async sendOtpEmail(email: string, otp: string) {
    return this.sendEmail({
      to: email,
      subject: 'Your BoldMind OTP Code',
      html: `<p>Your one-time code is: <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
      text: `Your OTP is ${otp}. Expires in 10 minutes.`,
    });
  }

  async sendPaymentReceiptEmail(userId: string, email: string, amount: number, plan: string) {
    return this.sendEmail({
      userId,
      to: email,
      subject: `Payment Confirmed — ${plan} Plan`,
      html: this.buildReceiptTemplate(amount, plan),
      text: `Payment of ₦${amount.toLocaleString()} confirmed for ${plan} plan.`,
    });
  }

  // ─── WHATSAPP (direct Meta Graph API call) ───────────────────────────────────
  //
  // NotificationService sends simple outbound text messages only.
  // Inbound webhooks, interactive messages, and conversation logging
  // are handled by MetaWebhookService inside PlanAIModule — keep them separate.

  async sendWhatsapp(
    phoneNumberId: string,
    to: string,
    message: string,
    accessToken?: string,
  ) {
    const token = accessToken ?? this.defaultWaToken;
    const url = `https://graph.facebook.com/${this.metaApiVersion}/${phoneNumberId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          url,
          {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: message },
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );

      await this.logNotification({
        type: NotificationType.WHATSAPP,
        title: 'WhatsApp Message',
        body: message,
        meta: { to, phoneNumberId, messageId: data?.messages?.[0]?.id },
      });

      return data;
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data;
      this.logger.error(`WhatsApp send failed to ${to}:`, detail);
      throw err;
    }
  }

  // ─── WEB PUSH ────────────────────────────────────────────────────────────────

  async subscribePush(
    userId: string,
    subscription: webpush.PushSubscription,
    deviceLabel?: string,
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys as any,
        deviceLabel,
      },
      update: { userId, keys: subscription.keys as any },
    });
  }

  async unsubscribePush(endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async sendPushToUser(userId: string, dto: SendPushDto) {
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId, isActive: true },
    });
    if (!subs.length) return { sent: 0, total: 0 };

    const payload = JSON.stringify({
      title: dto.title,
      body: dto.body,
      icon: dto.icon ?? '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: dto.data,
      url: dto.url,
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as any },
          payload,
        ),
      ),
    );

    // Clean up stale subscriptions (410 Gone / 404 Not Found)
    await Promise.allSettled(
      results.map(async (r, i) => {
        if (r.status === 'rejected') {
          const statusCode = (r.reason as any)?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: subs[i]!.endpoint },
            });
          }
        }
      }),
    );

    await this.logNotification({
      userId,
      type: NotificationType.PUSH,
      title: dto.title,
      body: dto.body,
    });

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    return { sent, total: subs.length };
  }

  // ─── BROADCAST (queued) ──────────────────────────────────────────────────────

  async broadcastToAll(dto: {
    title: string;
    body: string;
    url?: string;
    icon?: string;
  }) {
    await this.pushQueue.add(JOBS.PUSH.BROADCAST, dto);
    return { message: 'Broadcast queued' };
  }

  async broadcastEmail(
    subject: string,
    html: string,
    segment?: 'all' | 'pro' | 'free',
  ) {
    await this.emailQueue.add(JOBS.EMAIL.BROADCAST, {
      subject,
      html,
      segment: segment ?? 'all',
    });
    return { message: 'Email broadcast queued' };
  }

  // ─── IN-APP NOTIFICATIONS ────────────────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
      unread,
    };
  }

  async markAsRead(userId: string, notificationIds?: string[]) {
    const where: any = { userId };
    if (notificationIds?.length) where.id = { in: notificationIds };
    await this.prisma.notification.updateMany({
      where,
      data: { read: true, readAt: new Date() },
    });
    return { message: 'Marked as read' };
  }

  async deleteNotification(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { message: 'Deleted' };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async logNotification(data: {
    userId?: string;
    type: NotificationType;
    title: string;
    body: string;
    meta?: any;
  }) {
    try {
      if (data.userId) {
        await this.prisma.notification.create({
          data: {
            userId: data.userId,
            type: data.type,
            title: data.title,
            body: data.body,
            meta: data.meta ?? {},
          },
        });
      }
    } catch (e) {
      this.logger.warn('Failed to log notification', e);
    }
  }

  private buildWelcomeTemplate(name: string): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
        <h1 style="color:#6d28d9">Welcome to BoldMind, ${name}! 🚀</h1>
        <p>Your account is ready. Start exploring our suite of AI-powered tools.</p>
        <a href="https://boldmind.ng/dashboard"
           style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">
          Go to Dashboard
        </a>
        <p style="color:#6b7280;margin-top:24px;font-size:13px">BoldMind · Lagos, Nigeria</p>
      </div>`;
  }

  private buildPasswordResetTemplate(url: string): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
        <h2>Reset Your Password</h2>
        <p>Click below to reset your BoldMind password. This link expires in 1 hour.</p>
        <a href="${url}"
           style="background:#dc2626;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px;margin-top:16px">
          If you didn't request this, ignore this email.
        </p>
      </div>`;
  }

  private buildReceiptTemplate(amount: number, plan: string): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
        <h2>Payment Confirmed ✅</h2>
        <p>Your <strong>${plan}</strong> plan is now active.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb">Amount</td>
            <td>₦${amount.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding:8px;border-bottom:1px solid #e5e7eb">Plan</td>
            <td>${plan}</td>
          </tr>
          <tr>
            <td style="padding:8px">Date</td>
            <td>${new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' })}</td>
          </tr>
        </table>
        <a href="https://boldmind.ng/dashboard"
           style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:24px">
          View Dashboard
        </a>
      </div>`;
  }
}