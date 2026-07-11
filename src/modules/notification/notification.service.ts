// src/modules/notification/notification.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import { HttpService } from "@nestjs/axios";
import { Queue } from "bullmq";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { firstValueFrom } from "rxjs";
import * as webpush from "web-push";
import { PrismaService } from "../../database/prisma.service";
import { SendEmailDto } from "./dto/send-email.dto";
import { SendPushDto } from "./dto/send-push.dto";
import { NotificationType } from "@prisma/client";
import { QUEUES, JOBS } from "../../common/constants/queues";
import type {
  OTPService,
  OTPPurpose,
  OTPChannel,
  OTPResult,
  OTPDeliveryLog,
} from "@boldmindng/sms";
import { Inject } from "@nestjs/common";
import { OTP_SERVICE } from "./notification.module";
import * as React from "react";

/**
 * Wraps @react-email/render + React.createElement together.
 * Needed because React 19's widened ReactNode (which now includes
 * `Promise<ReactNode>` for async components) doesn't satisfy
 * @react-email/render's `render(element: ReactElement)` signature when a
 * component is invoked as a plain function call. createElement's return
 * type is always a concrete ReactElement, sidestepping the mismatch.
 */
function renderEmail<P extends object>(
  Component: (props: P) => React.ReactNode,
  props: P,
): Promise<string> {
  return render(React.createElement(Component, props));
}

// ── @boldmindng/email — shared React Email templates (replaces hand-rolled HTML) ──
// Prop shapes below match the ACTUAL components in packages/email/src/templates/*.tsx:
//   WelcomeEmail            ({ fullName })
//   VerifyEmail              ({ fullName, verificationCode })
//   ResetPasswordEmail      ({ fullName?, resetUrl })
//   SubscriptionStarted     ({ name, plan, product })
//   WaitlistJoined          ({ email, concept })
//   SsoWelcomeExternal      ({ name, domain })
//   VibeCodersAccepted      ({ fullName })
import {
  WelcomeEmail,
  VerifyEmail,
  ResetPasswordEmail,
  SubscriptionStarted,
  WaitlistJoined,
  SsoWelcomeExternal,
  VibeCodersAccepted,
} from "@boldmindng/email";

// ── @boldmindng/sms — WhatsApp-first, SMS-fallback OTP orchestrator (§5 of system design) ──

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  private readonly metaApiVersion = "v19.0";
  private readonly defaultWaToken: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private http: HttpService,
    @InjectQueue(QUEUES.EMAIL_NOTIFICATIONS) private emailQueue: Queue,
    @InjectQueue(QUEUES.PUSH_NOTIFICATIONS) private pushQueue: Queue,
    @Inject(OTP_SERVICE) private readonly otpService: OTPService, // ← injected, see notification.module.ts
  ) {
    this.resend = new Resend(this.config.get<string>("RESEND_API_KEY"));
    this.fromEmail = this.config.get<string>(
      "RESEND_FROM_EMAIL",
      "hello@boldmind.ng",
    );
    this.defaultWaToken = this.config.get<string>("META_WHATSAPP_TOKEN", "");

    webpush.setVapidDetails(
      `mailto:${this.fromEmail}`,
      this.config.getOrThrow<string>("VAPID_PUBLIC_KEY"),
      this.config.getOrThrow<string>("VAPID_PRIVATE_KEY"),
    );

    if (!this.config.get<string>("META_WHATSAPP_ACCESS_TOKEN")) {
      this.logger.warn(
        "META_WHATSAPP_ACCESS_TOKEN not set — OTP WhatsApp delivery will fail until configured",
      );
    }
    if (!this.config.get<string>("TERMII_API_KEY")) {
      this.logger.warn(
        "TERMII_API_KEY not set — OTP SMS fallback will fail until configured",
      );
    }
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
      this.logger.error("Resend email failed", err);
      throw err;
    }
  }

  // ── Templated sends — each renders the shared @boldmindng/email component to
  // HTML via @react-email/render using the component's REAL prop names, then
  // reuses sendEmail()'s Resend + logging path.

  async sendWelcomeEmail(userId: string, name: string, email: string) {
    const html = await renderEmail(WelcomeEmail, { fullName: name });
    return this.sendEmail({
      userId,
      to: email,
      subject: `Welcome to the ecosystem, ${name}! 🚀`,
      html,
      text: `Welcome to BoldMind, ${name}! Your account is ready.`,
    });
  }

  async sendPasswordResetEmail(
    email: string,
    resetUrl: string,
    fullName?: string,
  ) {
    const html = await renderEmail(ResetPasswordEmail, { fullName, resetUrl });
    return this.sendEmail({
      to: email,
      subject: "Reset Your BoldMind Password",
      html,
      text: `Reset your password here: ${resetUrl}`,
    });
  }

  async sendOtpEmail(email: string, otp: string, fullName = "there") {
    const html = await renderEmail(VerifyEmail, {
      fullName,
      verificationCode: otp,
    });
    return this.sendEmail({
      to: email,
      subject: "Your BoldMind OTP Code",
      html,
      text: `Your OTP is ${otp}. Expires in 30 minutes.`,
    });
  }

  async sendSubscriptionStartedEmail(
    userId: string,
    email: string,
    name: string,
    plan: string,
    product: string,
  ) {
    const html = await renderEmail(SubscriptionStarted, {
      name,
      plan,
      product,
    });
    return this.sendEmail({
      userId,
      to: email,
      subject: `Your ${product} subscription is active`,
      html,
      text: `Your ${plan} plan on ${product} is now active.`,
    });
  }

  async sendWaitlistJoinedEmail(email: string, concept: string) {
    const html = await renderEmail(WaitlistJoined, { email, concept });
    return this.sendEmail({
      to: email,
      subject: `You're on the ${concept} waitlist — VillageCircle NG`,
      html,
      text: `We've added ${email} to the waitlist for ${concept}.`,
    });
  }

  async sendSsoWelcomeExternalEmail(
    email: string,
    name: string,
    domain: string,
  ) {
    const html = await renderEmail(SsoWelcomeExternal, { name, domain });
    return this.sendEmail({
      to: email,
      subject: "You signed in to a new BoldmindNG app",
      html,
      text: `Hi ${name}, you just signed in to ${domain} using your BoldmindNG account.`,
    });
  }

  async sendVibeCodersAcceptedEmail(email: string, fullName: string) {
    const html = await renderEmail(VibeCodersAccepted, { fullName });
    return this.sendEmail({
      to: email,
      subject: "Your Vibe Coders application was accepted 🚀",
      html,
      text: `Hello ${fullName}, congratulations! Your Vibe Coders application has been accepted.`,
    });
  }

  /**
   * Unified OTP dispatch — delegates entirely to @boldmindng/sms OTPService,
   * which runs WhatsApp → Termii SMS → email (email_verify only) internally
   * (see packages/sms/src/otp.service.ts). The email step is served by the
   * ResendOtpEmailProvider adapter wired in notification.module.ts, so this
   * method no longer needs its own hand-rolled email branch.
   *
   * `to` must be an E.164 phone number for whatsapp/sms delivery, or an
   * email address when purpose === 'email_verify'. We steer OTPService
   * straight to the email channel in that case (rather than letting it
   * burn a wasted WhatsApp/Termii attempt against a non-phone `to`) by
   * setting preferChannel: 'email'.
   */
  async sendOtp(dto: {
    to: string;
    code: string;
    purpose: string;
    name?: string;
    preferChannel?: OTPChannel;
  }): Promise<OTPResult & { deliveryLog?: OTPDeliveryLog }> {
    const isEmailTarget = dto.to.includes("@");
    const wantsEmail =
      dto.purpose === "email_verify" || dto.preferChannel === "email";

    if (wantsEmail && !isEmailTarget) {
      return {
        delivered: false,
        channel: "email",
        error: "email_verify purpose requires an email address in `to`",
      };
    }

    const preferChannel: OTPChannel | undefined =
      dto.preferChannel ?? (wantsEmail || isEmailTarget ? "email" : undefined);

    const result = await this.otpService.send({
      to: dto.to,
      code: dto.code,
      purpose: dto.purpose as OTPPurpose,
      name: dto.name,
      preferChannel,
    });

    if (!result.delivered) {
      this.logger.warn(
        `OTP delivery failed via ${result.channel} for ${dto.to}: ${result.error}`,
      );
    }

    return result;
  }

  /** Returns the VAPID public key so the frontend can call PushManager.subscribe(). */
  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.config.getOrThrow<string>("VAPID_PUBLIC_KEY") };
  }

  // ─── WHATSAPP (direct Meta Graph API call — plain text, not OTP) ─────────────
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
    const resolvedPhoneNumberId =
      phoneNumberId ||
      this.config.getOrThrow<string>("META_WHATSAPP_PHONE_NUMBER_ID");
    const token = accessToken ?? this.defaultWaToken;
    const url = `https://graph.facebook.com/${this.metaApiVersion}/${resolvedPhoneNumberId}/messages`;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          url,
          {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: message },
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );

      await this.logNotification({
        type: NotificationType.WHATSAPP,
        title: "WhatsApp Message",
        body: message,
        meta: {
          to,
          phoneNumberId: resolvedPhoneNumberId,
          messageId: data?.messages?.[0]?.id,
        },
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
      icon: dto.icon ?? "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
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

    await Promise.allSettled(
      results.map(async (r, i) => {
        if (r.status === "rejected") {
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

    const sent = results.filter((r) => r.status === "fulfilled").length;
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
    return { message: "Broadcast queued" };
  }

  async broadcastEmail(
    subject: string,
    html: string,
    segment?: "all" | "pro" | "free",
  ) {
    await this.emailQueue.add(JOBS.EMAIL.BROADCAST, {
      subject,
      html,
      segment: segment ?? "all",
    });
    return { message: "Email broadcast queued" };
  }

  // ─── IN-APP NOTIFICATIONS ────────────────────────────────────────────────────

  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
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
    return { message: "Marked as read" };
  }

  async deleteNotification(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { message: "Deleted" };
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
      this.logger.warn("Failed to log notification", e);
    }
  }
}
