// src/common/constants/queues.ts
//
// SINGLE SOURCE OF TRUTH for every BullMQ queue + job name in boldmind-service.
// Nothing outside this file should contain a literal queue-name or job-name string.
//
//   Registration (once, app-wide):  src/common/queues/queues.module.ts
//   Producers:   @InjectQueue(QUEUES.X)  →  queue.add(JOBS.GROUP.Y, payload)
//   Consumers:   @Processor(QUEUES.X)    →  switch (job.name) { case JOBS.GROUP.Y: ... }
//
// Retry/backoff policy is defined ONCE here (QUEUE_DEFAULT_JOB_OPTIONS) and applied
// at registration time. Producers should NOT pass { attempts, backoff } inline —
// that duplication is exactly what caused queue-name drift in the first place.

import type { JobsOptions } from "bullmq";

export const QUEUES = {
  // ── Communication ──────────────────────────────────────────────
  EMAIL_NOTIFICATIONS: "email-notifications",
  MARKETING_AUTOMATION: "marketing-automation",
  PUSH_NOTIFICATIONS: "push-notifications",
  SMS_OTP: "sms-otp",
  NOTIFICATIONS_DISPATCH: "notifications", // VERIFY: notification.module.ts — flagged in project notes as
  // previously unregistered/no-consumer. May be fully redundant
  // with EMAIL_NOTIFICATIONS/PUSH_NOTIFICATIONS/SMS_OTP above —
  // need notification.service.ts to confirm before deciding
  // keep-vs-delete.

  // ── Content & Social ───────────────────────────────────────────
  SOCIAL_PUBLISHING: "social-publishing",
  AI_GENERATION: "ai-generation",
  IMAGE_GENERATION: "image-generation",
  SOCIAL_FACTORY: "social-factory",
  VIDEO_RENDER: "video-render",
  CONTENT_SEO: "content-seo",
  CONTENT_PROCESSING: "content", // VERIFY: amebogist.module.ts — used by rss.service.ts/amebogist.service.ts?
  // No @Processor class currently visible consuming this. Need those two
  // files to confirm job names/purpose before finalizing JOBS group + defaults.

  // ── Business Operations ────────────────────────────────────────
  PAYROLL_PROCESSING: "payroll-processing",
  MEDIA_PROCESSING: "media-processing",
  AI_AGENT_TASKS: "ai-agent-tasks",

  // ── Payments & Wallet ──────────────────────────────────────────
  PAYMENT_WEBHOOK: "payment-webhook",
  WALLET_CREDIT: "wallet-credit",

  // ── Background Intelligence ────────────────────────────────────
  TREND_ANALYSIS: "trend-analysis",
  KOLO_REMINDERS: "kolo-reminders",

  // ── Enterprise & Extensions ────────────────────────────────────
  POLYMIND_QUERY: "polymind-query",
  WEBHOOK_DELIVERY: "webhook-delivery",

  // ── Data Hygiene ───────────────────────────────────────────────
  NDPA_ERASURE: "ndpa-erasure",
  SEO_SITEMAP: "seo-sitemap",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// ── Job names, grouped by DOMAIN rather than by queue, so a copy-paste across
//    queues can never silently collide on the same constant. ──────────────────
export const JOBS = {
  EMAIL: {
    SEND_BATCH: "send-batch", // EmailCampaignProcessor
    EXPIRY_REMINDER: "expiry-reminder", // EmailCampaignProcessor
    BROADCAST: "broadcast-email", // NotificationService → EmailCampaignProcessor
  },
  PUSH: {
    BROADCAST: "broadcast-push", // NotificationService → PushBroadcastProcessor
  },
  SOCIAL: {
    POST: "post", // SocialPostProcessor
  },
  AI: {
    EMAIL_SCRAPE: "email-scrape", // AIJobsProcessor (Business Discovery Directory)
  },
  AGENT: {
    TASK: "agent-task", // BizAgentTaskProcessor — taskType lives in job.data, not job.name
  },
} as const;

export const QUEUE_PRIORITIES: Record<QueueName, number> = {
  [QUEUES.PAYMENT_WEBHOOK]: 1, // Critical — never delay Paystack
  [QUEUES.WALLET_CREDIT]: 2, // High — financial integrity
  [QUEUES.SMS_OTP]: 2, // High — user is waiting
  [QUEUES.PAYROLL_PROCESSING]: 3, // High — time-sensitive
  [QUEUES.AI_AGENT_TASKS]: 4, // High-ish — agent tasks are time-sensitive (invoice followups, bookings)
  [QUEUES.MARKETING_AUTOMATION]: 5, // Normal
  // QUEUE_PRIORITIES — add:
  [QUEUES.NOTIFICATIONS_DISPATCH]: 5, // VERIFY
  [QUEUES.CONTENT_PROCESSING]: 6, // VERIFY

  [QUEUES.EMAIL_NOTIFICATIONS]: 5, // Normal
  [QUEUES.PUSH_NOTIFICATIONS]: 5, // Normal
  [QUEUES.SOCIAL_PUBLISHING]: 5, // Normal (may be delayed jobs)
  [QUEUES.AI_GENERATION]: 5, // Normal
  [QUEUES.IMAGE_GENERATION]: 5, // Normal
  [QUEUES.SOCIAL_FACTORY]: 5, // Normal — VERIFY against social-factory.processor.ts intent
  [QUEUES.VIDEO_RENDER]: 5, // Normal — VERIFY
  [QUEUES.CONTENT_SEO]: 7, // Low-ish — VERIFY
  [QUEUES.MEDIA_PROCESSING]: 5, // Normal
  [QUEUES.KOLO_REMINDERS]: 5, // Normal
  [QUEUES.POLYMIND_QUERY]: 5, // Normal
  [QUEUES.WEBHOOK_DELIVERY]: 5, // Normal
  [QUEUES.TREND_ANALYSIS]: 8, // Low
  [QUEUES.SEO_SITEMAP]: 9, // Low
  [QUEUES.NDPA_ERASURE]: 9, // Low
};

// ── Default BullMQ retry/backoff policy per queue. Applied once at registration
//    time in QueuesModule. `attempts: 1` == "no retries" (the first try counts).
export const QUEUE_DEFAULT_JOB_OPTIONS: Record<QueueName, JobsOptions> = {
  [QUEUES.PAYMENT_WEBHOOK]: {
    attempts: 5,
    backoff: { type: "fixed", delay: 10_000 },
  },
  [QUEUES.WALLET_CREDIT]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
  },
  [QUEUES.SMS_OTP]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3_000 },
  },
  [QUEUES.PAYROLL_PROCESSING]: { attempts: 1 },
  [QUEUES.AI_AGENT_TASKS]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
  [QUEUES.MARKETING_AUTOMATION]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
  [QUEUES.EMAIL_NOTIFICATIONS]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
  [QUEUES.PUSH_NOTIFICATIONS]: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5_000 },
  },
  [QUEUES.SOCIAL_PUBLISHING]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
  },
  [QUEUES.AI_GENERATION]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 4_000 },
  },
  // QUEUE_DEFAULT_JOB_OPTIONS — add:
  [QUEUES.NOTIFICATIONS_DISPATCH]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3_000 },
  }, // VERIFY
  [QUEUES.CONTENT_PROCESSING]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
  }, // VERIFY
  [QUEUES.IMAGE_GENERATION]: { attempts: 1 },
  [QUEUES.SOCIAL_FACTORY]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 4_000 },
  }, // VERIFY
  [QUEUES.VIDEO_RENDER]: { attempts: 1 }, // VERIFY
  [QUEUES.CONTENT_SEO]: { attempts: 1 }, // VERIFY
  [QUEUES.MEDIA_PROCESSING]: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3_000 },
  },
  [QUEUES.TREND_ANALYSIS]: { attempts: 1 },
  [QUEUES.KOLO_REMINDERS]: { attempts: 1 },
  [QUEUES.POLYMIND_QUERY]: { attempts: 1 },
  [QUEUES.WEBHOOK_DELIVERY]: {
    attempts: 3,
    backoff: { type: "exponential", delay: 4_000 },
  },
  [QUEUES.NDPA_ERASURE]: { attempts: 1 },
  [QUEUES.SEO_SITEMAP]: { attempts: 1 },
};
