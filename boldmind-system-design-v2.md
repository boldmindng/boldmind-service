# BoldmindNG Ecosystem — System Design v2.0
tree -I "node_modules|dist|coverage|.git" -L 5
**Canonical Reference | All 8 Repositories + Chrome Extension | Africa/Lagos | June 2026**
**Stack: Next.js 16.2 · React 19.2 · pnpm 10.34.1 · Node 22.22.3 · NestJS · Prisma · MongoDB**

> **HOW TO USE:** This document is always read alongside your actual project trees.
> Never infer file paths — always attach the repo's project-tree.md when generating code.
> Products, prices, colors are always from `products.ts`, `pricing.ts`, `colors.ts` — never hardcoded.

---

## Table of Contents

1. [Repo Map & Stack Versions](#1-repo-map--stack-versions)
2. [Architecture Diagram (Corrected)](#2-architecture-diagram-corrected)
3. [Redis Split Architecture](#3-redis-split-architecture)
4. [Wallet Service — Full Implementation](#4-wallet-service--full-implementation)
5. [OTP — WhatsApp First, SMS Fallback](#5-otp--whatsapp-first-sms-fallback)
6. [boldmind-shared — New Packages Needed](#6-boldmind-shared--new-packages-needed)
7. [EduCenter — All Learning Verticals](#7-educenter--all-learning-verticals)
8. [Enterprise API & Developer Platform](#8-enterprise-api--developer-platform)
9. [Changelog & Documentation Pages](#9-changelog--documentation-pages)
10. [PolyMind Chrome Extension](#10-polymind-chrome-extension)
11. [Prisma Schema — Addendum](#11-prisma-schema--addendum)
12. [MongoDB Schemas — Addendum](#12-mongodb-schemas--addendum)
13. [Background Jobs — Updated Queue Map](#13-background-jobs--updated-queue-map)
14. [Migration Wave Update](#14-migration-wave-update)
15. [Master Output Checklist (Updated)](#15-master-output-checklist-updated)
16. [Missing Modules Table (Complete)] (#16-Missing-Modules-Table-complete)
17. [API Reference Cross-Reference] (#17-Missing-Modules-Table)
18. [Cross-App Package Usage Matrix] (#18-Missing-Modules-Table)

---

## 1. Repo Map & Stack Versions

### 1.1 All Repos — Confirmed from Project Trees

| Repo | Type | Deploy | Primary Domain | Confirmed Files |
|---|---|---|---|---|
| `boldmind-service` | NestJS monolith | Railway | `api.boldmind.ng` | `src/app.module.ts`, `prisma/schema.prisma` |
| `boldmind-shared` | pnpm monorepo (turbo) | npm/GitHub Packages | — | `turbo.json`, `pnpm-workspace.yaml`, 7 packages |
| `boldmind-web` | Next.js 16.2 | Vercel | `boldmind.ng` | `app/boldmindLayout.tsx`, `app/sso/route.ts` |
| `planai-suite` | Next.js 16.2 | Vercel | `planai.boldmind.ng` | `app/planai-landingLayout.tsx`, `lib/suite-products.ts` |
| `amebogist-web` | Next.js 16.2 | Vercel | `amebogist.ng` | `app/amebogistLayout.tsx`, `components/AdBanner.tsx` |
| `educenter-web` | Next.js 16.2 | Vercel | `educenter.com.ng` | `app/educenterLayout.tsx`, `app/(dashboard)/study-hub/` |
| `villagecircle-web` | Next.js 16.2 | Vercel | `villagecircle.ng` | `app/villagecircleLayout.tsx`, `app/(vibe-coders)/` |
| `polymind-extension` | Chrome Extension MV3 | Chrome Web Store | — | New repo — see Section 10 |

### 1.2 Confirmed Stack (use EXACTLY these versions)

```json
{
  "runtime":     "Node.js 22.22.3",
  "packageManager": "pnpm@10.34.1",
  "next":        "16.2.x",
  "react":       "19.2.x",
  "react-dom":   "19.2.x",
  "typescript":  "5.x",
  "nestjs":      "^10.x",
  "@prisma/client": "^6.x",
  "mongoose":    "^8.x",
  "bullmq":      "^5.x",
  "ioredis":     "^5.x"
}
```

### 1.3 boldmind-shared — Confirmed Packages (from tree)

```
packages/
├── analytics/     → tracker.ts, utm.ts, flywheel.ts
├── api-client/    → client.ts + per-module api files (admin, amebogist, auth, educenter,
│                    fitness, hub, media, notifications, payment, planai,
│                    users, vibecoders, villagecircle, os, automation, n8n-client)
├── auth/          → middleware.ts, sso.ts, store.ts, token.ts, auth-provider.tsx,
│                    use-user.ts, use-permissions.ts
├── email/         → service.ts + templates (VerifyEmail, WelcomeEmail, ResetPassword,
│                    SubscriptionStarted, WaitlistJoined, SsoWelcomeExternal)
├── payments/      → paystack/client.ts, flutterwave/client.ts
├── ui/            → Button, Card, CrossLink, SuperNavbar, SuperFooter, PricingContent,
│                    StatusBadge, DyslexiaToggle, FontProvider, Modal, LoadingSpinner,
│                    ErrorBoundary, CookieConsent, ParticleBackground, TypewriterEffect,
│                    SocialLinks, Logo, Confetti, Input, Link, analytics/FacebookSDK
└── utils/         → formatters/{currency,date,text}, hooks/{useLocalStorage,useOffline,
                     usePaystack,useStorage}, constants/{auth,colors,pricing,products},
                     types/{api,index,product,user}, validators/{bvn,phone}, storage.ts
```

### 1.4 New Packages to Add to boldmind-shared

```
packages/
├── sms/           → NEW: packages/sms/  (Termii + WhatsApp OTP provider)
├── wallet/        → NEW: packages/wallet/ (wallet helpers, balance formatting)
└── api-docs/      → NEW: packages/api-docs/ (OpenAPI spec + client SDK types)
```

---

## 2. Architecture Diagram (Corrected)

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    VERCEL EDGE NETWORK (Next.js 16.2)                    ║
║                                                                          ║
║  boldmind-web        planai-suite        amebogist-web                   ║
║  boldmind.ng         planai.boldmind.ng  amebogist.ng                    ║
║  ┌──────────┐        ┌──────────┐        ┌──────────┐                    ║
║  │Layout:   │        │Layout:   │        │Layout:   │                    ║
║  │boldmind  │        │planai-   │        │amebogist │                    ║
║  │Layout.tsx│        │landing   │        │Layout.tsx│                    ║
║  │          │        │Layout.tsx│        │          │                    ║
║  │SSO: app/ │        │SSO: via  │        │SSO: app/ │                    ║
║  │sso/route │        │middleware│        │api/auth  │                    ║
║  └────┬─────┘        └────┬─────┘        └────┬─────┘                    ║
║       │                   │                   │                          ║
║  educenter-web        villagecircle-web   polymind-extension              ║
║  educenter.com.ng     villagecircle.ng    Chrome MV3                      ║
║  ┌──────────┐        ┌──────────┐        ┌──────────┐                    ║
║  │Layout:   │        │Layout:   │        │popup.html│                    ║
║  │educenter │        │village   │        │sidepanel │                    ║
║  │Layout.tsx│        │circle    │        │content.js│                    ║
║  │          │        │Layout.tsx│        │          │                    ║
║  │SSO: app/ │        │SSO: via  │        │Uses API  │                    ║
║  │api/auth/ │        │middleware│        │key auth  │                    ║
║  │callback  │        │          │        │          │                    ║
║  └────┬─────┘        └────┬─────┘        └────┬─────┘                    ║
╚═══════╪═══════════════════╪═══════════════════╪══════════════════════════╝
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │ HTTPS REST + SSE
                            │ Authorization: Bearer <jwt>
                            │ packages/api-client (boldmind-shared)
                            ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                    RAILWAY — boldmind-service (NestJS)                   ║
║                                                                          ║
║  src/modules/                                                            ║
║  ├── auth/          (auth.controller, sso/sso.controller)                ║
║  ├── user/          (user.controller, user-me.controller)                ║
║  ├── admin/         (admin.controller, health.controller)                ║
║  ├── hub/           (hub.controller)                                     ║
║  ├── payment/       (payment.controller, subscription.service)           ║
║  ├── media/         (media.controller)                                   ║
║  ├── notification/  (notification.controller)                            ║
║  ├── analytics/     (analytics.controller)                               ║
║  ├── ai/            (ai.controller + providers: openai,groq,gemini,      ║
║  │                   fal,cloudflare,ollama + social-factory.processor)   ║
║  ├── automation/    (automation.controller + queues: ai-jobs,            ║
║  │                   email-campaign, social-post processors)             ║
║  ├── amebogist/     (amebogist.controller, rss.service +                ║
║  │                   schemas: post,comment,reaction,creator-stats)       ║
║  ├── educenter/     (educenter.controller, aloc.service)                 ║
║  ├── planai/        (13 controllers + 14 services + planai.processor)    ║
║  └── villagecircle/ (module + sub-modules: afrohustle, borderless-remit, ║
║                      farmgate, kolo-ai, naijagig, receiptgenius,         ║
║                      safeai, skill2cash, vibecoders, waitlist)           ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║  REDIS-SESSION          REDIS-QUEUE          REDIS-CACHE                 ║
║  (Upstash / Railway)    (Upstash / Railway)  (Upstash / Railway)         ║
║  SSO relay tokens       BullMQ all queues    ALOC questions              ║
║  JWT refresh families   Job payloads         Feature flags               ║
║  Rate limit counters    Dead letter queue    Rate windows                ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Neon PostgreSQL                  MongoDB Atlas                          ║
║  (prisma/schema.prisma)           (mongoose schemas per module)          ║
║  Users, Auth, Payments,           Amebogist posts/comments/reactions     ║
║  Subscriptions, Wallet,           AI jobs, prompt templates              ║
║  CRM, HR, EduCenter,              n8n logs, translations                 ║
║  VibeCoders, SafeAI,              BorderlessRemit rates                  ║
║  Marketplace, Storefront          FarmGate listings                      ║
╚══════════════════════════════════════════════════════════════════════════╝
                            │
╔══════════════════════════════════════════════════════════════════════════╗
║  EXTERNAL SERVICES                                                       ║
║  WhatsApp Business API (OTP primary) · Termii (SMS fallback)             ║
║  Paystack (payments) · Flutterwave (fallback)                            ║
║  OpenAI GPT-4o · Groq · Google Gemini · Cloudflare AI · Ollama          ║
║  fal.ai (FLUX image gen) · Anthropic Claude (PolyMind extension)         ║
║  Resend (email) · Google OAuth · Meta Graph API · TikTok API             ║
║  Cloudflare R2 (storage) · Cloudflare Stream (video)                    ║
║  n8n (automation workflows) · ALOC API (exam questions)                  ║
║  GIG Logistics · NIBSS (BVN/NIN verify) · FIRS API                      ║
╚══════════════════════════════════════════════════════════════════════════╝
```

### 2.1 Confirmed NestJS Module Files (from boldmind-service tree)

The following are **confirmed existing** in `src/modules/`:

```
✅ auth/auth.controller.ts + auth.service.ts + auth.guard.ts + jwt-auth.guard.ts
✅ auth/sso/sso.controller.ts + sso.service.ts
✅ auth/strategies/google.strategy.ts + jwt.strategy.ts
✅ auth/roles.guard.ts + permissions.guard.ts
✅ auth/dto/auth.dto.ts + login.dto.ts + register.dto.ts
✅ user/user.controller.ts + user-me.controller.ts + user.service.ts + user.dto.ts
✅ admin/admin.controller.ts + admin.service.ts + health.controller.ts
✅ hub/hub.controller.ts + hub.service.ts
✅ payment/payment.controller.ts + payment.service.ts + subscription.service.ts + payment.dto.ts
✅ media/media.controller.ts + media.service.ts
✅ notification/notification.controller.ts + notification.service.ts
✅ analytics/analytics.controller.ts + analytics.service.ts
✅ ai/ai.controller.ts + ai.service.ts + processors/social-factory.processor.ts
✅ ai/providers/{cloudflare,fal,gemini,groq,ollama,openai}.provider.ts
✅ ai/services/trend.service.ts + video-factory.service.ts
✅ automation/automation.controller.ts + automation.service.ts
✅ automation/queue/{ai-jobs,email-campaign,social-post}.processor.ts
✅ amebogist/ (full module with schemas + scripts + sub-services)
✅ educenter/ (controller + service + aloc.service)
✅ planai/ (13 controllers + 14 services — all present)
✅ villagecircle/ (module + 10 sub-modules)

🔲 wallet/ — MISSING — needs to be built (see Section 4)
🔲 api/ (enterprise developer API) — MISSING — see Section 8
🔲 changelog/ — MISSING — see Section 9
```

---

## 3. Redis Split Architecture

### Problem
A single Redis instance handling sessions, BullMQ queues, and caching simultaneously risks:
- Memory saturation from large job payloads crowding out session keys
- BullMQ's BRPOP blocking commands competing with session reads
- A single `FLUSHDB` accident wiping all three data planes

### Solution — Three Redis Instances

```
REDIS_SESSION_URL   → Upstash Redis #1 (small, fast, persistence=AOF)
REDIS_QUEUE_URL     → Upstash Redis #2 (larger memory, persistence=RDB)
REDIS_CACHE_URL     → Upstash Redis #3 (eviction=allkeys-lru, no persistence)
```

### 3.1 What Goes Where

| Data | Redis Instance | Key Pattern | TTL |
|---|---|---|---|
| JWT refresh token families | SESSION | `refresh:{family}:{tokenId}` | 7 days |
| SSO relay tokens | SESSION | `sso:relay:{64-hex}` | 60 seconds |
| Rate limit counters | SESSION | `ratelimit:{endpoint}:{userId}` | 60 seconds |
| OTP codes | SESSION | `otp:{purpose}:{email}` | 15 minutes |
| Feature flags | SESSION | `flags:{userId}` / `flags:global` | 5 minutes |
| BullMQ job queues (all) | QUEUE | BullMQ internal keys | varies |
| BullMQ completed jobs | QUEUE | BullMQ internal keys | 24 hours |
| BullMQ failed jobs | QUEUE | BullMQ internal keys | 7 days |
| ALOC exam questions | CACHE | `aloc:{subject}:{type}:{year}` | 24 hours |
| Exchange rates (BorderlessRemit) | CACHE | `remit:rates:{currency}` | 1 hour |
| Trend data | CACHE | `trends:ng:{date}` | 2 hours |
| Admin dashboard stats | CACHE | `admin:stats:{date}` | 15 minutes |
| PlanAI tool access map | CACHE | `planai:access:{userId}` | 5 minutes |
| PostHog feature flags | CACHE | `posthog:flags:{userId}` | 5 minutes |

### 3.2 NestJS Redis Configuration

```typescript
// src/database/redis.service.ts — UPDATED
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly session: Redis;  // auth, SSO, rate limiting, OTP
  readonly queue: Redis;    // BullMQ (passed to Bull config)
  readonly cache: Redis;    // ALOC, trends, computed data

  constructor(private config: ConfigService) {
    this.session = new Redis(this.config.get('REDIS_SESSION_URL')!, {
      maxRetriesPerRequest: null,  // required by BullMQ workers
      lazyConnect: false,
    });

    this.queue = new Redis(this.config.get('REDIS_QUEUE_URL')!, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });

    this.cache = new Redis(this.config.get('REDIS_CACHE_URL')!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }

  onModuleDestroy() {
    this.session.quit();
    this.queue.quit();
    this.cache.quit();
  }
}
```

```typescript
// src/app.module.ts — BullMQ uses QUEUE redis only
BullModule.forRootAsync({
  inject: [RedisService],
  useFactory: (redis: RedisService) => ({
    connection: redis.queue,  // ← queue instance, not session
  }),
}),
```

### 3.3 Environment Variables (Updated)

```env
# THREE Redis instances — required
REDIS_SESSION_URL=redis://default:<password>@<host>:6379   # Upstash #1
REDIS_QUEUE_URL=redis://default:<password>@<host>:6379     # Upstash #2
REDIS_CACHE_URL=redis://default:<password>@<host>:6379     # Upstash #3

# Recommended Upstash plan per instance:
# SESSION: 256MB, AOF persistence, max-memory-policy=noeviction
# QUEUE:   1GB, RDB persistence, max-memory-policy=noeviction
# CACHE:   512MB, no persistence, max-memory-policy=allkeys-lru
```

---

## 4. Wallet Service — Full Implementation

The Wallet feature is confirmed **missing** from the current codebase. The `boldmind-web` project tree shows `app/(dashboard)/dashboard/wallet/page.tsx` exists on the frontend, and `boldmind-system-design.md` lists Wallet/WalletLedger in the Prisma schema — but there is no corresponding NestJS module. This section documents the complete implementation.

### 4.1 What the Wallet Does

- Holds a Naira balance per user (stored in kobo)
- Credits: subscription refunds, referral commissions, affiliate earnings, promotional bonuses, marketplace payouts
- Debits: subscription payments (pay from wallet), marketplace purchases
- Every credit/debit creates a WalletLedger entry (immutable audit trail)
- Daily debit cap: ₦1,000,000 (Tier 1); ₦5,000,000 (Tier 2 — requires BVN)
- CBN Tier 1 wallet — no direct bank withdrawal without BVN upgrade

### 4.2 Prisma Models (Add to schema.prisma)

```prisma
// ─── WALLET ─────────────────────────────────────────────────────────────────

model Wallet {
  id              String        @id @default(cuid())
  userId          String        @unique
  balanceKobo     Int           @default(0)
  tier            WalletTier    @default(TIER1)
  dailyDebitKobo  Int           @default(0)     // resets at midnight Lagos time
  lastDebitReset  DateTime      @default(now())
  isLocked        Boolean       @default(false) // locked on suspicious activity
  lockReason      String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  user    User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  ledger  WalletLedger[]

  @@map("wallets")
}

model WalletLedger {
  id            String            @id @default(cuid())
  walletId      String
  type          WalletEntryType
  amountKobo    Int               // positive = credit, negative = debit
  balanceAfter  Int               // snapshot of balance after this entry
  description   String
  reference     String?           // Paystack ref, subscription ID, etc.
  source        WalletSource
  metadata      Json?
  createdAt     DateTime          @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([walletId])
  @@index([walletId, createdAt])
  @@index([reference])
  @@map("wallet_ledger")
}

enum WalletTier {
  TIER1   // email + phone — max ₦50k/day
  TIER2   // + BVN verified — max ₦5M/day
}

enum WalletEntryType {
  CREDIT
  DEBIT
}

enum WalletSource {
  REFERRAL_COMMISSION
  AFFILIATE_EARNING
  SUBSCRIPTION_REFUND
  ADMIN_CREDIT
  PROMOTIONAL_BONUS
  MARKETPLACE_PAYOUT
  SUBSCRIPTION_PAYMENT   // debit — paid subscription using wallet
  MARKETPLACE_PURCHASE   // debit
  WITHDRAWAL             // debit — future: to bank account
}
```

### 4.3 NestJS Wallet Module

**Location:** `src/modules/wallet/`

```
src/modules/wallet/
├── wallet.module.ts
├── wallet.controller.ts
├── wallet.service.ts
└── wallet.dto.ts
```

**wallet.service.ts — key methods:**

```typescript
// src/modules/wallet/wallet.service.ts

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ── Get or create wallet ───────────────────────────────────────────────────

  async getOrCreate(userId: string): Promise<Wallet> {
    return this.prisma.wallet.upsert({
      where:  { userId },
      update: {},
      create: { userId, balanceKobo: 0 },
    });
  }

  // ── Credit (add funds) ─────────────────────────────────────────────────────

  async credit(params: {
    userId:      string;
    amountKobo:  number;
    source:      WalletSource;
    description: string;
    reference?:  string;
    metadata?:   Record<string, unknown>;
  }): Promise<WalletLedger> {
    // All wallet mutations use a Prisma transaction to prevent race conditions
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId: params.userId },
        data:  { balanceKobo: { increment: params.amountKobo } },
      });

      return tx.walletLedger.create({
        data: {
          walletId:     wallet.id,
          type:         'CREDIT',
          amountKobo:   params.amountKobo,
          balanceAfter: wallet.balanceKobo,
          description:  params.description,
          reference:    params.reference,
          source:       params.source,
          metadata:     params.metadata ?? {},
        },
      });
    });
  }

  // ── Debit (spend funds) ────────────────────────────────────────────────────

  async debit(params: {
    userId:      string;
    amountKobo:  number;
    source:      WalletSource;
    description: string;
    reference?:  string;
  }): Promise<WalletLedger> {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: params.userId } });

      // Insufficient funds
      if (wallet.balanceKobo < params.amountKobo) {
        throw new BadRequestException(
          `Insufficient wallet balance. Available: ₦${wallet.balanceKobo / 100}`
        );
      }

      // Daily debit cap check
      const cap = wallet.tier === 'TIER1' ? 5_000_000 : 500_000_000; // kobo
      await this.resetDailyDebitIfNeeded(tx, wallet);
      if (wallet.dailyDebitKobo + params.amountKobo > cap) {
        throw new BadRequestException('Daily debit limit exceeded for this wallet tier');
      }

      // Locked wallet
      if (wallet.isLocked) {
        throw new ForbiddenException(`Wallet is locked: ${wallet.lockReason}`);
      }

      const updated = await tx.wallet.update({
        where: { userId: params.userId },
        data:  {
          balanceKobo:    { decrement: params.amountKobo },
          dailyDebitKobo: { increment: params.amountKobo },
        },
      });

      return tx.walletLedger.create({
        data: {
          walletId:     updated.id,
          type:         'DEBIT',
          amountKobo:   -params.amountKobo,   // negative for debits
          balanceAfter: updated.balanceKobo,
          description:  params.description,
          reference:    params.reference,
          source:       params.source,
        },
      });
    });
  }

  // ── Daily reset ────────────────────────────────────────────────────────────

  private async resetDailyDebitIfNeeded(tx: any, wallet: any) {
    const now      = new Date();
    const lagosNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
    const lastReset = new Date(wallet.lastDebitReset.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));

    if (lagosNow.toDateString() !== lastReset.toDateString()) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data:  { dailyDebitKobo: 0, lastDebitReset: now },
      });
      wallet.dailyDebitKobo = 0;
    }
  }

  // ── Balance ────────────────────────────────────────────────────────────────

  async getBalance(userId: string) {
    const wallet = await this.getOrCreate(userId);
    return {
      balanceKobo:  wallet.balanceKobo,
      balanceNaira: `₦${(wallet.balanceKobo / 100).toLocaleString('en-NG')}`,
      tier:         wallet.tier,
      isLocked:     wallet.isLocked,
    };
  }

  // ── Ledger (paginated) ─────────────────────────────────────────────────────

  async getLedger(userId: string, page = 1, pageSize = 20) {
    const wallet = await this.getOrCreate(userId);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.walletLedger.findMany({
        where:   { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
      }),
      this.prisma.walletLedger.count({ where: { walletId: wallet.id } }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // ── Upgrade to Tier 2 (BVN required) ─────────────────────────────────────

  async upgradeTier(userId: string, bvnHash: string): Promise<void> {
    // bvnHash was already verified via NIBSS; store hash only — never plain BVN
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { userId },
        data:  { tier: 'TIER2' },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:  { bvnHash },
      }),
    ]);
  }
}
```

**wallet.controller.ts:**

```typescript
// src/modules/wallet/wallet.controller.ts

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  getBalance(@CurrentUser() user: JwtPayload) {
    return this.wallet.getBalance(user.sub);
  }

  @Get('ledger')
  getLedger(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.wallet.getLedger(user.sub, page, Math.min(pageSize, 50));
  }

  @Post('upgrade')
  @HttpCode(200)
  upgradeTier(@CurrentUser() user: JwtPayload, @Body() dto: UpgradeTierDto) {
    return this.wallet.upgradeTier(user.sub, dto.bvnHash);
  }
}
```

**API endpoints:**

```
GET  /api/v1/wallet               → balance + tier + lock status
GET  /api/v1/wallet/ledger        → paginated transaction history
POST /api/v1/wallet/upgrade       → upgrade to Tier 2 with BVN hash
```

### 4.4 Which Service Handles Wallet?

**Recommended:** Keep wallet as a NestJS sub-module inside `boldmind-service` (not a separate service). Reasons:

- Wallet mutations must be in the same transaction as subscription activation (Paystack webhook)
- Referral commission credits must be atomic with referral conversion
- No separate auth/network hop required between payment and wallet

**Future:** When wallet grows to include bank withdrawals or lending, extract to `boldmind-wallet-service` (separate Railway service) with its own Postgres instance. Use a message queue (BullMQ cross-service) or gRPC for inter-service calls.

### 4.5 Frontend Wallet Page (boldmind-web)

```
app/(dashboard)/dashboard/wallet/page.tsx   ← already exists in project tree

Contents:
  - Balance hero card (big ₦ number, tier badge)
  - "Top Up" CTA → redirects to payment flow with productSlug='wallet-topup'
  - Tier upgrade section (visible if tier === TIER1)
  - Paginated transaction ledger (credit/debit, source label, date)
  - Upcoming earnings (pending affiliate/referral commissions)
```

---

## 5. OTP — WhatsApp First, SMS Fallback

### 5.1 Strategy

Nigerian users trust WhatsApp over SMS. WhatsApp OTP also bypasses DND (Do Not Disturb) registry issues that can silently swallow Termii SMS.

```
OTP Delivery Order:
  1. WhatsApp Business API (primary — 95% delivery rate Nigeria)
  2. Termii SMS (fallback — if WhatsApp fails or user has no WhatsApp)
  3. Email OTP (final fallback — for email-verify flows only)

When to try WhatsApp first:
  - User has a verified phone number on file
  - phone starts with +234 or is a Nigerian number
  
When to go straight to SMS:
  - User explicitly chose SMS in preferences
  - WhatsApp delivery failed (status: 'failed' from Meta webhook)

When to use email only:
  - email_verify purpose (WhatsApp/SMS are phone-only)
  - User has no phone number on file
```

### 5.2 New Package: `packages/sms`

```
boldmind-shared/packages/sms/
├── package.json
├── src/
│   ├── index.ts
│   ├── types.ts
│   ├── whatsapp.provider.ts   ← WhatsApp Business API (Meta Cloud API)
│   ├── termii.provider.ts     ← Termii SMS
│   └── otp.service.ts         ← Orchestrates: WhatsApp → SMS → fallback
├── tsconfig.json
└── tsup.config.ts
```

**package.json:**
```json
{
  "name": "@boldmindng/sms",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "axios": "^1.7.x"
  },
  "devDependencies": {
    "tsup": "^8.x",
    "typescript": "^5.x"
  }
}
```

**otp.service.ts:**

```typescript
// packages/sms/src/otp.service.ts
export type OTPPurpose = 'phone_verify' | 'password_reset' | 'login_2fa' | 'transaction_confirm';
export type OTPChannel = 'whatsapp' | 'sms' | 'email';

export interface SendOTPParams {
  to:      string;        // E.164 phone number, e.g. +2348012345678
  code:    string;        // 6-digit OTP
  purpose: OTPPurpose;
  name?:   string;        // user's first name for personalisation
  preferChannel?: OTPChannel;  // user preference override
}

export interface OTPResult {
  delivered: boolean;
  channel:   OTPChannel;
  messageId?: string;
  error?:    string;
}

export class OTPService {
  constructor(
    private readonly whatsapp: WhatsAppProvider,
    private readonly termii:   TermiiProvider,
  ) {}

  async send(params: SendOTPParams): Promise<OTPResult> {
    // Try WhatsApp first for Nigerian numbers
    const isNigerian = params.to.startsWith('+234');
    const preferred  = params.preferChannel;

    if (preferred !== 'sms' && isNigerian) {
      const result = await this.tryWhatsApp(params);
      if (result.delivered) return result;
      // WhatsApp failed → fall through to SMS
    }

    // SMS fallback
    const smsResult = await this.trySMS(params);
    if (smsResult.delivered) return smsResult;

    // Both failed
    return { delivered: false, channel: 'sms', error: 'All delivery channels failed' };
  }

  private async tryWhatsApp(params: SendOTPParams): Promise<OTPResult> {
    try {
      const messageId = await this.whatsapp.sendOTP({
        to:      params.to,
        code:    params.code,
        name:    params.name,
        purpose: params.purpose,
      });
      return { delivered: true, channel: 'whatsapp', messageId };
    } catch (e) {
      return { delivered: false, channel: 'whatsapp', error: String(e) };
    }
  }

  private async trySMS(params: SendOTPParams): Promise<OTPResult> {
    try {
      const messageId = await this.termii.sendOTP({
        to:      params.to,
        code:    params.code,
        purpose: params.purpose,
      });
      return { delivered: true, channel: 'sms', messageId };
    } catch (e) {
      return { delivered: false, channel: 'sms', error: String(e) };
    }
  }
}
```

**whatsapp.provider.ts:**

```typescript
// packages/sms/src/whatsapp.provider.ts
// Uses Meta Cloud API (WhatsApp Business API)

export class WhatsAppProvider {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  constructor(
    private readonly phoneNumberId: string,  // META_WHATSAPP_PHONE_NUMBER_ID
    private readonly accessToken:   string,  // META_WHATSAPP_ACCESS_TOKEN
  ) {}

  async sendOTP(params: {
    to:      string;
    code:    string;
    name?:   string;
    purpose: string;
  }): Promise<string> {
    // Use a WhatsApp template message for OTP
    // Template must be pre-approved by Meta: "boldmind_otp"
    // Template variables: {{1}} = name, {{2}} = code, {{3}} = purpose, {{4}} = expiry
    const body = {
      messaging_product: 'whatsapp',
      to: params.to.replace('+', ''),  // Meta expects number without +
      type: 'template',
      template: {
        name:     'boldmind_otp',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.name ?? 'there' },
              { type: 'text', text: params.code },
              { type: 'text', text: this.purposeLabel(params.purpose) },
              { type: 'text', text: '15 minutes' },
            ],
          },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: params.code }],
          },
        ],
      },
    };

    const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`WhatsApp API error: ${JSON.stringify(err)}`);
    }

    const data = await res.json();
    return data.messages?.[0]?.id ?? 'unknown';
  }

  private purposeLabel(purpose: string): string {
    const labels: Record<string, string> = {
      phone_verify:        'verify your phone number',
      password_reset:      'reset your password',
      login_2fa:           'complete your login',
      transaction_confirm: 'confirm your transaction',
    };
    return labels[purpose] ?? 'complete your action';
  }
}
```

**WhatsApp OTP Template (to submit to Meta for approval):**
```
Template name: boldmind_otp
Category: AUTHENTICATION
Language: English

Body:
Hi {{1}}, your BoldmindNG code to {{3}} is: *{{2}}*

This code expires in {{4}}. Do not share it with anyone.

Button: Copy Code → {{2}}
```

**termii.provider.ts:**

```typescript
// packages/sms/src/termii.provider.ts

export class TermiiProvider {
  private readonly baseUrl = 'https://v3.api.termii.com/api';

  constructor(
    private readonly apiKey:   string,   // TERMII_API_KEY
    private readonly senderId: string,   // "BOLDMIND" (NCC registered)
  ) {}

  async sendOTP(params: { to: string; code: string; purpose: string }): Promise<string> {
    const message = `Your BoldmindNG code is: ${params.code}. Expires in 15 mins. Do not share.`;

    const res = await fetch(`${this.baseUrl}/sms/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to:        params.to,
        from:      this.senderId,
        sms:       message,
        type:      'plain',
        api_key:   this.apiKey,
        channel:   'dnd',         // DND bypass channel for transactional messages
        media:     {},
      }),
    });

    const data = await res.json();
    if (data.code !== 'ok') throw new Error(`Termii error: ${data.message}`);
    return data.message_id ?? 'unknown';
  }
}
```

### 5.3 Integration in boldmind-service

```typescript
// src/modules/notification/notification.module.ts — add OTP provider
import { OTPService, WhatsAppProvider, TermiiProvider } from '@boldmindng/sms';

// Use in auth.service.ts → sendOTP():
// BEFORE (SMS only):
await this.termii.send({ to: phone, message: `Your code: ${code}` });

// AFTER (WhatsApp first, SMS fallback):
const result = await this.otpService.send({
  to:      phone,
  code:    otp,
  purpose: 'phone_verify',
  name:    user.name.split(' ')[0],
});
// Store result.channel in OTPVerification.metadata for debugging
```

### 5.4 New Email Templates Needed

Add to `packages/email/src/templates/`:

```
OTPEmail.tsx              → fallback for email-based OTP (verify-email flow)
WalletCreditEmail.tsx     → wallet credited notification
WalletDebitEmail.tsx      → wallet debited notification
EnterpriseApiKeyEmail.tsx → API key issued to enterprise customer
CourseEnrolledEmail.tsx   → learner enrolled in a course
PlaybookUnlockedEmail.tsx → business playbook unlocked
VibeCodersAccepted.tsx    → vibe coder application accepted
```

---

## 6. boldmind-shared — New Packages Needed

### 6.1 `packages/sms` (documented above in Section 5)

### 6.2 `packages/wallet`

Helper package for wallet display and formatting on the frontend. Does NOT talk to the database — that's the service's job.

```
packages/wallet/
├── package.json
├── src/
│   ├── index.ts
│   ├── formatters.ts      ← formatBalance, formatLedgerEntry, walletTierLabel
│   ├── types.ts           ← WalletDto, LedgerEntryDto, WalletTier
│   └── hooks/
│       └── useWallet.ts   ← React hook: fetches balance, ledger, credit/debit actions
└── tsconfig.json
```

```typescript
// packages/wallet/src/hooks/useWallet.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useWallet() {
  const client = useQueryClient();

  const balance = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn:  () => apiClient.get('/wallet'),
  });

  const ledger = useQuery({
    queryKey: ['wallet', 'ledger'],
    queryFn:  () => apiClient.get('/wallet/ledger'),
  });

  // Refetch after any subscription payment or referral conversion
  const invalidate = () => client.invalidateQueries({ queryKey: ['wallet'] });

  return { balance, ledger, invalidate };
}
```

### 6.3 `packages/api-docs`

```
packages/api-docs/
├── package.json
├── src/
│   ├── index.ts
│   ├── openapi.ts      ← generates OpenAPI 3.1 spec from NestJS swagger decorators
│   ├── sdk-types.ts    ← auto-generated TypeScript types for enterprise SDK
│   └── changelog.ts    ← reads CHANGELOG.md per package, outputs structured data
└── scripts/
    └── generate.ts     ← pnpm run generate → outputs openapi.json + sdk-types.ts
```
### 6.4  `packages/pwa` ✨

```
boldmind-shared/packages/pwa/
├── CHANGELOG.md
├── package.json
├── src/
│   ├── index.ts
│   ├── manifest.ts          ← generateManifest(product) → WebAppManifest
│   ├── service-worker.ts    ← registerServiceWorker(swUrl?)
│   ├── sw-template.ts       ← SW_TEMPLATE string helper (precache + runtime cache)
│   ├── offline-cache.ts     ← cacheStrategies: networkFirst, cacheFirst, staleWhileRevalidate
│   ├── install-prompt.tsx   ← useInstallPrompt() hook + InstallPromptBanner component
│   ├── push.ts              ← subscribeToPush(vapidPublicKey), unsubscribeFromPush()
│   ├── twa.ts               ← generateTwaConfig(product) → BubblewrapTwaManifest
│   └── types.ts
├── tsconfig.json             ← extends react-library.json (DOM + React JSX)
└── tsup.config.ts
```

**Package identity:**
```json
{
  "name": "@boldmindng/pwa",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": { "build": "tsup", "dev": "tsup --watch" },
  "dependencies": { "react": "19.2.x" },
  "devDependencies": { "tsup": "^8.x", "typescript": "^5.x" }
}
```

**Full export contract:**

| Export | File | Signature | Used in |
|---|---|---|---|
| `generateManifest` | `manifest.ts` | `(product: Product, opts?: { startUrl?: string, scope?: string }) => WebAppManifest` | Each app's `app/manifest.ts` (Next.js Metadata API) |
| `registerServiceWorker` | `service-worker.ts` | `(swUrl = '/sw.js') => void` — client-side, no-op in dev | Root layout `'use client'` component |
| `SW_TEMPLATE` | `sw-template.ts` | string template / build helper — produces `public/sw.js` per app | `turbo.json` `build:sw` task for apps with `twa` |
| `cacheStrategies` | `offline-cache.ts` | `{ networkFirst(routes), cacheFirst(routes), staleWhileRevalidate(routes) }` | EduCenter (`cacheFirst`), AmeboGist (`staleWhileRevalidate`) |
| `useInstallPrompt` | `install-prompt.tsx` | `() => { isInstallable, isInstalled, promptInstall: () => Promise<void> }` | `InstallPromptBanner` |
| `InstallPromptBanner` | `install-prompt.tsx` | `{ productSlug: string, dismissible?: boolean }` | Re-exported via `@boldmindng/ui`, root layouts |
| `subscribeToPush` | `push.ts` | `(vapidPublicKey: string) => Promise<PushSubscriptionJSON>` | Settings "Enable notifications" toggle |
| `unsubscribeFromPush` | `push.ts` | `() => Promise<void>` | Settings "Disable notifications" |
| `generateTwaConfig` | `twa.ts` | `(product: Product) => BubblewrapTwaManifest` | TWA build scripts for 4 products |
| Types | `types.ts` | `WebAppManifest`, `BubblewrapTwaManifest`, `CacheStrategyConfig` | — |

**Rules:**
- `generateManifest` must guard: only run for products where `product.twa !== undefined` — use `getProductsWithTWA()` from `@boldmindng/utils`
- `registerServiceWorker` is a no-op in dev (`NODE_ENV !== 'production'`) — prevents stale-cache dev issues
- `generateTwaConfig` output must be validated against Bubblewrap CLI schema before each TWA build
- VAPID keys must live in **both** `boldmind-service` env **AND** each frontend env:
  - Service: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  - Frontend: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public only, for `subscribeToPush`)

**TWA products (4 confirmed from products.ts `twa` field):**
```
project-manager-twa   → ng.boldmind.projects   (boldmind.ng/projects)
boldmind-fitness-twa  → ng.boldmind.fit         (boldmind.ng/fitness)
amebogist-twa         → ng.amebogist.app        (amebogist.ng)
educenter-twa         → ng.educenter.app        (educenter.com.ng)
```

---

### 6.5 `packages/deploy-config` ✨

```
boldmind-shared/packages/deploy-config/
├── CHANGELOG.md
├── package.json
├── src/
│   ├── index.ts
│   ├── env-schema.ts         ← APP_ENV_SCHEMAS, validateEnv()
│   ├── vercel-config.ts      ← generateVercelConfig(appName)
│   ├── health-check.ts       ← createHealthCheckRoute()
│   ├── cors.ts               ← getCorsOrigins()
│   ├── domains.ts            ← DOMAIN_CONFIG
│   └── security-headers.ts   ← securityHeaders()
├── tsconfig.json             ← extends node-library.json
└── tsup.config.ts
```

**Full export contract:**

| Export | File | Signature | Used in |
|---|---|---|---|
| `APP_ENV_SCHEMAS` | `env-schema.ts` | `Record<AppName, ZodSchema>` — one schema per app, listing all required env vars | CI validate step |
| `validateEnv` | `env-schema.ts` | `(appName: AppName, env: Record<string, string \| undefined>) => { valid, missing, errors }` | Each app's `instrumentation.ts` `register()` hook — fails fast on misconfiguration |
| `getCorsOrigins` | `cors.ts` | `() => string[]` — reads `FRONTEND_URLS`, splits on comma, falls back to `getAllDomains()` from products.ts | `boldmind-service` `main.ts` |
| `DOMAIN_CONFIG` | `domains.ts` | `Record<CoreDomain, { app, vercelProject, envPrefix }>` — from `CORE_DOMAINS + getAllSubdomains()` | Deployment scripts, CI matrix |
| `generateVercelConfig` | `vercel-config.ts` | `(appName: AppName) => VercelConfig` — SSO rewrites, security headers, legacy redirects | Each app's `vercel.json` (generated, not hand-written) |
| `securityHeaders` | `security-headers.ts` | `() => HeaderEntry[]` — HSTS, X-Content-Type-Options, Referrer-Policy, CSP | `generateVercelConfig`, `next.config.mjs` `headers()` |
| `createHealthCheckRoute` | `health-check.ts` | `() => RouteHandler` — `GET /api/health` → `{ status, app, uptime, version }` | Each app's `app/api/health/route.ts` |
| Types | — | `AppName`, `VercelConfig`, `HeaderEntry` | — |

**`APP_ENV_SCHEMAS` apps covered:**
```typescript
type AppName =
  | 'boldmind-web'
  | 'planai-suite'
  | 'amebogist-web'
  | 'educenter-web'
  | 'villagecircle-web'
  | 'boldmind-service'
  | 'polymind-extension';
```

**CSP rules for `securityHeaders`:**
- `connect-src`: must include `https://api.boldmind.ng`, Paystack endpoints, PostHog
- Must NOT expose Redis/Upstash URLs (server-only)
- `generateVercelConfig` rewrites must preserve `?sso_token=` query param — don't let Vercel strip it

**Usage — each Next.js app `next.config.mjs`:**
```typescript
import { securityHeaders } from '@boldmindng/deploy-config';

const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders() }];
  },
};
export default nextConfig;
```

---

---

## 7. EduCenter — All Learning Verticals

The existing `educenter-web` project tree shows these confirmed routes:
```
app/(dashboard)/
├── business-school/page.tsx      ← exists
├── dashboard/page.tsx            ← exists
├── study-hub/                    ← full exam 
│   ├── page.tsx
│   ├── history/page.tsx
│   ├── leaderboard/page.tsx
│   ├── notes/page.tsx
│   ├── practice/[subject]/[year]/page.tsx
│   ├── progress/page.tsx
│   ├── subjects/page.tsx
│   └── subjects/[subject]/page.tsx
└── subscription/page.tsx
```

The following verticals need to be **added** to this structure and documented:

### 7.1 LMS Builder

**What it is:** Course creators (teachers, trainers, businesses) build and sell courses.

**New routes to add to educenter-web:**
```
app/(dashboard)/lms/
├── page.tsx                        ← LMS dashboard (my courses + stats)
├── create/page.tsx                 ← Course builder wizard
├── [courseId]/
│   ├── page.tsx                    ← Course overview + edit
│   ├── lessons/page.tsx            ← Lesson manager
│   ├── students/page.tsx           ← Enrolled students
│   └── earnings/page.tsx           ← Revenue from this course
└── templates/page.tsx              ← Course template picker
```

**NestJS — EduCenter module additions:**
```
src/modules/educenter/
├── lms/
│   ├── lms.controller.ts           ← CRUD for courses + lessons
│   ├── lms.service.ts
│   └── dto/lms.dto.ts
```

**New API endpoints:**
```
POST /api/v1/educenter/lms/courses                → create course
GET  /api/v1/educenter/lms/courses                → list instructor's courses
PATCH /api/v1/educenter/lms/courses/:id           → update course
POST /api/v1/educenter/lms/courses/:id/publish    → publish (makes public)
POST /api/v1/educenter/lms/courses/:id/lessons    → add lesson
PATCH /api/v1/educenter/lms/lessons/:id           → update lesson
DELETE /api/v1/educenter/lms/lessons/:id          → delete lesson
GET  /api/v1/educenter/lms/courses/:id/students   → enrolled students
GET  /api/v1/educenter/lms/courses/:id/earnings   → revenue breakdown (Paystack split)
```

**Data model:** Uses existing `Course`, `CourseLesson`, `CourseEnrollment` Prisma models — no new models needed.

### 7.2 School Management Portal

**What it is:** Licensed for schools at ₦500/student/term. Principals/admins manage their school's use of EduCenter.

**New routes:**
```
app/(dashboard)/school/
├── page.tsx                        ← School admin dashboard
├── students/page.tsx               ← Student roster + bulk enroll CSV
├── teachers/page.tsx               ← Teacher accounts
├── classes/page.tsx                ← Class groups (SS3A, SS3B, etc.)
├── assignments/page.tsx            ← Set assignments by class
├── results/page.tsx                ← Class performance reports
└── billing/page.tsx                ← Current plan, student count, renewal
```

**NestJS — EduCenter module additions:**
```
src/modules/educenter/
├── school/
│   ├── school.controller.ts
│   ├── school.service.ts
│   └── dto/school.dto.ts
```

**New Prisma model (add to schema.prisma):**
```prisma
model School {
  id             String   @id @default(cuid())
  name           String
  state          String
  address        String?
  contactEmail   String
  adminUserId    String   @unique  // the school admin's User.id
  plan           String   @default("basic")
  studentSlots   Int      @default(50)
  usedSlots      Int      @default(0)
  payingUntil    DateTime?
  paystackSubCode String? @unique
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  admin    User     @relation(fields: [adminUserId], references: [id])

  @@map("schools")
}

// UserProfile gets a new field:
// schoolId  String?  // set when user is enrolled as school student
```

**API endpoints:**
```
POST /api/v1/educenter/schools/register        → school admin registers school
GET  /api/v1/educenter/schools/me              → my school dashboard data
POST /api/v1/educenter/schools/me/students     → bulk enroll via CSV or array
GET  /api/v1/educenter/schools/me/students     → paginated student list
GET  /api/v1/educenter/schools/me/performance  → class-level analytics
POST /api/v1/educenter/schools/me/assignments  → create assignment for a class
```

### 7.3 AI Course Generator

**What it is:** LMS instructors provide a topic + audience → AI generates a complete course outline with lessons, quizzes, and a summary video script.

**New routes:**
```
app/(dashboard)/lms/generate/page.tsx       ← AI course generator form
app/(dashboard)/lms/generate/result/page.tsx ← Generated course preview + "Save as Draft"
```

**Flow:**
1. Instructor fills form: `{ topic, targetAudience, level, numberOfModules, includeQuizzes }`
2. POST `/api/v1/educenter/lms/generate` → queues AI job → returns `{ jobId }`
3. Frontend polls `GET /api/v1/planai/social/jobs/:jobId` (reuses the PlanAI job pattern)
4. AI generates: course title, description, module names, lesson outlines per module, quiz questions
5. Result shown as an editable preview — instructor can modify before saving

**NestJS processor uses `ai-generation` queue with OpenAI GPT-4o:**
```
System prompt: "You are an expert curriculum designer for Nigerian students and entrepreneurs.
Generate a complete course structure in JSON format..."
```

### 7.4 Business School + Playbooks

**What it is:** `app/(dashboard)/business-school/page.tsx` already exists. This section defines its complete structure.

**Routes (expand existing):**
```
app/(dashboard)/business-school/
├── page.tsx                            ← Landing: featured playbooks + categories
├── playbooks/
│   ├── page.tsx                        ← Browse all playbooks (6 public, rest auth-gated)
│   └── [slug]/page.tsx                 ← Single playbook reader
├── courses/
│   ├── page.tsx                        ← Business courses library (6 public)
│   └── [courseId]/page.tsx             ← Course player
└── certificates/page.tsx               ← My earned certificates
```

**Public vs Auth-Gated content:**

```typescript
// Public (no login required, read-only, first 6 of each):
const PUBLIC_PLAYBOOK_SLUGS = [
  'start-a-business-in-nigeria-2026',
  'how-to-open-a-pos-agent',
  'amazon-fba-from-nigeria',
  'social-media-for-beginners',
  'how-to-register-your-business-cac',
  'side-hustles-that-pay-daily',
];

// Authenticated users see all playbooks (100+)
// Pro subscribers can download PDF + access AI business mentor chat
```

**Prompt Library (public 6, rest auth-gated):**

```typescript
// New model: PromptTemplate (MongoDB)
// Location: src/modules/educenter/schemas/prompt-template.schema.ts

interface PromptTemplate {
  slug:        string;          // e.g. "write-a-business-plan"
  title:       string;
  description: string;
  category:    string;          // "business" | "marketing" | "exam-prep" | "productivity"
  template:    string;          // the prompt text with {{placeholders}}
  variables:   string[];        // names of placeholders
  isPublic:    boolean;         // true → visible without login
  isPremium:   boolean;         // true → requires Pro subscription
  usageCount:  number;
  tags:        string[];
  authorId?:   string;          // null for BoldmindNG official prompts
  createdAt:   Date;
  updatedAt:   Date;
}
```

**New API endpoints:**
```
GET  /api/v1/educenter/prompts              → list (6 public without auth, all with auth)
GET  /api/v1/educenter/prompts/:slug        → single prompt
POST /api/v1/educenter/prompts/:slug/use   → increment usageCount + return filled template
GET  /api/v1/educenter/playbooks           → list playbooks (6 public, all with auth)
GET  /api/v1/educenter/playbooks/:slug     → single playbook content
```

**New routes for educenter-web:**
```
app/
├── prompts/                            ← Public prompt library (6 shown, rest behind CTA)
│   ├── page.tsx
│   └── [slug]/page.tsx
```

### 7.5 Vibe Coders Classroom

**Already confirmed in villagecircle-web:**
```
app/(vibe-coders)/vibe-coders/portal/
├── cohort/page.tsx           ← cohort overview
├── curriculum/page.tsx       ← module list
├── curriculum/[moduleId]/page.tsx ← module content
├── mentors/page.tsx
├── projects/page.tsx
├── projects/[projectId]/page.tsx
├── profile/page.tsx
└── settings/page.tsx
```

**What needs to be documented:**

The Vibe Coders Classroom is the **protected learning environment** for enrolled students. It lives at `villagecircle.ng/vibe-coders/portal/*`.

**Curriculum data source:** `lib/vibe-coders/curriculum-data.ts` (confirmed in project tree — static data file, not API). This is intentional — curriculum is curated, not CMS-driven.

**Session types:**
1. **Self-paced modules** — video lessons from Cloudflare Stream + reading material
2. **Live cohort sessions** — external Zoom/Meet link embedded + attendance log
3. **Project submissions** — GitHub repo link + Loom video + written brief
4. **Mentor 1:1s** — Calendly integration per mentor

**New Prisma models (add to schema.prisma):**
```prisma
model VibeCoderProjectSubmission {
  id          String   @id @default(cuid())
  applicantId String   // VibeCoderApplicant.id
  moduleId    String   // from curriculum-data.ts
  githubUrl   String?
  loomUrl     String?
  brief       String   @db.Text
  status      String   @default("submitted")  // submitted | reviewed | approved | revision
  mentorNote  String?  @db.Text
  reviewedBy  String?  // mentor userId
  score       Int?     // 0-100
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([applicantId])
  @@map("vc_project_submissions")
}

model VibeCoderAttendance {
  id          String   @id @default(cuid())
  applicantId String
  sessionDate DateTime
  sessionType String   // "live" | "recorded"
  moduleId    String
  attended    Boolean  @default(false)
  joinedAt    DateTime?
  duration    Int?     // minutes
  createdAt   DateTime @default(now())

  @@unique([applicantId, sessionDate, moduleId])
  @@map("vc_attendance")
}
```

**New API endpoints (add to vibecoders.controller.ts):**
```
GET  /api/v1/villagecircle/vibecoders/portal/curriculum        → curriculum with progress
GET  /api/v1/villagecircle/vibecoders/portal/curriculum/:moduleId → module detail
POST /api/v1/villagecircle/vibecoders/portal/projects          → submit project
GET  /api/v1/villagecircle/vibecoders/portal/projects          → my submissions
PATCH /api/v1/villagecircle/vibecoders/portal/projects/:id     → mentor review (admin/mentor only)
POST /api/v1/villagecircle/vibecoders/portal/attendance        → log attendance
GET  /api/v1/villagecircle/vibecoders/portal/mentors           → mentor directory
```

---

## 8. Enterprise API & Developer Platform

### 8.1 What It Is

BoldmindNG exposes selected APIs for:
1. **Enterprise clients** — companies integrating BoldmindNG tools (e.g. a bank wanting EduCenter exam prep for their customers)
2. **Third-party developers** — building on top of AmeboGist content, PlanAI tools, or EduCenter questions

### 8.2 Repo Changes

**boldmind-service** gets a new module:
```
src/modules/api/
├── api.module.ts
├── api-key/
│   ├── api-key.controller.ts      ← create/revoke/list API keys
│   ├── api-key.service.ts
│   └── api-key.guard.ts           ← validates X-API-Key header
├── enterprise/
│   ├── enterprise.controller.ts   ← enterprise-only endpoints
│   └── enterprise.service.ts
└── rate-limit/
    └── api-rate-limit.guard.ts    ← per-key rate limiting via REDIS_SESSION
```

**New Prisma model:**
```prisma
model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  name        String                         // "Production", "Staging", etc.
  keyHash     String    @unique              // SHA-256 hash of the actual key
  prefix      String                         // first 8 chars for display: "bm_live_..."
  scopes      String[]                       // ["amebogist:read", "educenter:questions", ...]
  tier        ApiTier   @default(STARTER)
  isActive    Boolean   @default(true)
  rateLimit   Int       @default(1000)      // requests per hour
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([keyHash])
  @@map("api_keys")
}

enum ApiTier {
  STARTER      // 1,000 req/hr — free with account
  GROWTH       // 10,000 req/hr — ₦25k/month
  ENTERPRISE   // unlimited — custom contract
}
```

**Available API scopes:**
```typescript
export const API_SCOPES = {
  'amebogist:read':          'Read published articles and categories',
  'educenter:questions':     'Fetch exam questions (JAMB/WAEC/NECO)',
  'educenter:submit':        'Submit quiz attempts on behalf of students',
  'planai:social:generate':  'Generate social media captions',
  'planai:branding:logo':    'Generate logos',
  'villagecircle:waitlist':  'Add emails to concept waitlists',
  'users:profile:read':      'Read authenticated user profile',
  'payments:verify':         'Verify payment status by reference',
  'webhook:subscribe':       'Subscribe to BoldmindNG webhook events',
} as const;
```

### 8.3 API Key Authentication Guard

```typescript
// src/modules/api/api-key/api-key.guard.ts

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = req.headers['x-api-key'] as string;

    if (!rawKey || !rawKey.startsWith('bm_')) {
      throw new UnauthorizedException('Valid X-API-Key header required');
    }

    // Rate check via Redis (sliding window)
    const prefix = rawKey.slice(0, 8);
    const rateLimitKey = `apikey:ratelimit:${prefix}`;
    const count = await this.redis.session.incr(rateLimitKey);
    if (count === 1) await this.redis.session.expire(rateLimitKey, 3600);

    // Cache lookup first (avoid DB hit on every request)
    const cacheKey = `apikey:meta:${prefix}`;
    const cached = await this.redis.cache.get(cacheKey);

    let keyRecord: ApiKey;
    if (cached) {
      keyRecord = JSON.parse(cached);
    } else {
      const keyHash = createHash('sha256').update(rawKey).digest('hex');
      keyRecord = await this.prisma.apiKey.findUniqueOrThrow({ where: { keyHash } });
      await this.redis.cache.setex(cacheKey, 300, JSON.stringify(keyRecord)); // 5-min cache
    }

    if (!keyRecord.isActive) throw new UnauthorizedException('API key revoked');
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }
    if (count > keyRecord.rateLimit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Attach key metadata to request for scope checking in controllers
    req['apiKey'] = keyRecord;
    req['apiKeyUserId'] = keyRecord.userId;

    // Update lastUsedAt (fire-and-forget, don't await)
    this.prisma.apiKey.update({
      where: { id: keyRecord.id },
      data:  { lastUsedAt: new Date() },
    }).catch(() => null);

    return true;
  }
}
```

### 8.4 Enterprise API Endpoints

```
── API Key Management ───────────────────────────────────────────────────────

POST /api/v1/developer/keys
Auth: JWT (logged-in user)
Body: { name: string, scopes: string[], expiresAt?: string }
→ Creates key, returns ONCE: { key: "bm_live_xxxxxxxx...", prefix, scopes }
  The full key is NEVER stored and NEVER returned again — only the hash.

GET  /api/v1/developer/keys
Auth: JWT
→ List user's keys (prefix + scopes + lastUsedAt — no full key)

DELETE /api/v1/developer/keys/:id
Auth: JWT
→ Revoke key (sets isActive = false)

── Public/Enterprise API (X-API-Key auth) ───────────────────────────────────

GET  /api/v1/public/amebogist/posts            → scope: amebogist:read
GET  /api/v1/public/amebogist/posts/:slug      → scope: amebogist:read
GET  /api/v1/public/educenter/questions        → scope: educenter:questions
POST /api/v1/public/educenter/submit           → scope: educenter:submit
POST /api/v1/public/planai/social/caption      → scope: planai:social:generate
POST /api/v1/public/villagecircle/waitlist/:slug → scope: villagecircle:waitlist
GET  /api/v1/public/payments/verify/:reference → scope: payments:verify

── Webhooks ─────────────────────────────────────────────────────────────────

POST /api/v1/developer/webhooks
Auth: JWT
Body: { url: string, events: string[], secret: string }
→ Subscribe to BoldmindNG events (payment.success, article.published, etc.)

GET  /api/v1/developer/webhooks          → list subscriptions
DELETE /api/v1/developer/webhooks/:id    → unsubscribe
```

### 8.5 Developer Documentation Page

**New repo or page within boldmind-web:**

Option A (recommended): Add to `boldmind-web`:
```
app/(public)/developers/
├── page.tsx                    ← Developer portal landing
├── docs/
│   ├── page.tsx                ← API reference (rendered from OpenAPI spec)
│   ├── [section]/page.tsx      ← Section drill-down
│   └── quickstart/page.tsx     ← "Your first API call in 5 minutes"
├── keys/page.tsx               ← API key management (protected)
└── webhooks/page.tsx           ← Webhook subscriptions (protected)
```

Option B: Separate `developers.boldmind.ng` — simpler to deploy but adds a subdomain. Use Option A for now; migrate to Option B when traffic warrants it.

**Documentation tech:** Use `@scalar/api-reference` React component fed by the OpenAPI JSON from `packages/api-docs`. No custom markdown — everything driven by NestJS `@ApiProperty()` decorators + auto-generated spec.

---

## 9. Changelog & Documentation Pages

### 9.1 Changeset (boldmind-shared already has it)

The `boldmind-shared` monorepo already uses `@changesets/cli` (confirmed: `.changeset/config.json` and `CHANGELOG.md` per package). The process is:

```bash
# Create a changeset (run when making changes)
pnpm changeset

# Version packages based on changesets
pnpm changeset version

# Publish to GitHub Packages
pnpm changeset publish
```

**Each package has its own CHANGELOG.md** (confirmed from tree: `packages/analytics/CHANGELOG.md`, `packages/auth/CHANGELOG.md`, etc.)

### 9.2 Public Changelog Page

**Add to boldmind-web:**
```
app/(public)/changelog/
├── page.tsx                    ← Full changelog (aggregated from all packages + backend)
└── [version]/page.tsx          ← Single release notes page
```

**Data source:** `packages/api-docs/src/changelog.ts` reads all `CHANGELOG.md` files and produces structured JSON. The changelog page is a static RSC (`revalidate: 3600`).

**Changelog entry shape:**
```typescript
interface ChangelogEntry {
  version:     string;
  date:        string;
  packages:    string[];       // which packages changed
  type:        'major' | 'minor' | 'patch';
  summary:     string;         // first line of changeset description
  highlights:  string[];       // bullet points
  breaking?:   string[];       // breaking changes if major
  products?:   string[];       // which BOLDMIND_PRODUCTS are affected
}
```

### 9.3 System Status Page

**Add to boldmind-web:**
```
app/(public)/status/page.tsx    ← Uptime + incident history
```

**Data source:** Polls `GET /health` + stores uptime in a lightweight `SystemStatus` Postgres table. Can also use BetterUptime or UptimeRobot webhook → stores incidents.

---

## 10. PolyMind Chrome Extension

### 10.1 Overview

**Extension name:** Boldmind PolyMind — Multi-Model AI Comparator  
**Purpose:** User submits one prompt → sees side-by-side responses from multiple AI models simultaneously  
**Manifest:** V3  
**New repo:** `polymind-extension` (separate from all 7 existing repos)  
**Auth:** Uses BoldmindNG API key (from `GET /api/v1/developer/keys`) — NOT the SSO JWT (extensions can't rely on SSO cookies)

### 10.2 Repository Structure

```
polymind-extension/
├── manifest.json
├── package.json               (pnpm, React 19, TypeScript)
├── .npmrc                     (same as other repos — @boldmindng scope)
├── src/
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx           ← React 19 entry
│   │   ├── Popup.tsx          ← Main popup UI (500×600px)
│   │   └── components/
│   │       ├── ModelCard.tsx  ← Single model response card
│   │       ├── ModelGrid.tsx  ← Side-by-side grid (2-4 cols)
│   │       ├── PromptInput.tsx ← Textarea + submit button
│   │       ├── ModelSelector.tsx ← Toggle which models to include
│   │       ├── ApiKeySetup.tsx ← First-run key entry
│   │       └── HistoryPanel.tsx ← Past comparisons
│   ├── sidepanel/
│   │   ├── index.html         ← Side panel (wider, 400px)
│   │   ├── main.tsx
│   │   └── SidePanel.tsx      ← Expanded view with full responses
│   ├── background/
│   │   └── service-worker.ts  ← MV3 service worker (handles API calls)
│   ├── content/
│   │   └── content.ts         ← Injected into pages (optional: context menu)
│   ├── lib/
│   │   ├── api.ts             ← All AI model calls go through boldmind-service proxy
│   │   ├── models.ts          ← Model registry (name, provider, icon, default params)
│   │   ├── storage.ts         ← chrome.storage.local helpers
│   │   └── types.ts
│   └── assets/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
├── vite.config.ts             ← Vite + CRXJS plugin for MV3
└── tsconfig.json
```

### 10.3 manifest.json

```json
{
  "manifest_version": 3,
  "name": "Boldmind PolyMind",
  "short_name": "PolyMind",
  "version": "1.0.0",
  "description": "Compare AI model responses side-by-side. One prompt, all models.",
  "icons": {
    "16":  "src/assets/icon-16.png",
    "32":  "src/assets/icon-32.png",
    "48":  "src/assets/icon-48.png",
    "128": "src/assets/icon-128.png"
  },
  "action": {
    "default_popup": "src/popup/index.html",
    "default_title": "Boldmind PolyMind"
  },
  "side_panel": {
    "default_path": "src/sidepanel/index.html"
  },
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "permissions": [
    "storage",
    "sidePanel",
    "contextMenus",
    "activeTab"
  ],
  "host_permissions": [
    "https://api.boldmind.ng/*"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js":      ["src/content/content.ts"],
      "run_at":  "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/popup/*", "src/sidepanel/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

### 10.4 Supported AI Models

```typescript
// src/lib/models.ts

export interface ModelDefinition {
  id:          string;
  name:        string;
  provider:    string;
  icon:        string;    // emoji or CDN icon URL
  color:       string;    // brand color for the card
  description: string;
  maxTokens:   number;
  isDefault:   boolean;
  apiEndpoint: string;    // boldmind-service route that proxies to this model
}

export const POLYMIND_MODELS: ModelDefinition[] = [
  {
    id:          'gpt-4o',
    name:        'GPT-4o',
    provider:    'OpenAI',
    icon:        '🟢',
    color:       '#10A37F',
    description: 'OpenAI flagship — best for nuanced reasoning',
    maxTokens:   4096,
    isDefault:   true,
    apiEndpoint: '/api/v1/polymind/openai',
  },
  {
    id:          'claude-sonnet',
    name:        'Claude Sonnet',
    provider:    'Anthropic',
    icon:        '🟠',
    color:       '#D97706',
    description: 'Anthropic — exceptional at analysis and writing',
    maxTokens:   4096,
    isDefault:   true,
    apiEndpoint: '/api/v1/polymind/claude',
  },
  {
    id:          'gemini-pro',
    name:        'Gemini Pro',
    provider:    'Google',
    icon:        '🔵',
    color:       '#4285F4',
    description: 'Google Gemini — strong at factual queries',
    maxTokens:   4096,
    isDefault:   false,
    apiEndpoint: '/api/v1/polymind/gemini',
  },
  {
    id:          'llama-3.1',
    name:        'LLaMA 3.1 70B',
    provider:    'Meta / Groq',
    icon:        '⚫',
    color:       '#374151',
    description: 'Open-source via Groq — blazing fast inference',
    maxTokens:   4096,
    isDefault:   false,
    apiEndpoint: '/api/v1/polymind/groq',
  },
  {
    id:          'mistral',
    name:        'Mistral Large',
    provider:    'Mistral AI',
    icon:        '🟣',
    color:       '#7C3AED',
    description: 'European AI — strong multilingual + code',
    maxTokens:   4096,
    isDefault:   false,
    apiEndpoint: '/api/v1/polymind/mistral',
  },
];
```

### 10.5 Architecture: Proxy Through boldmind-service

The extension does NOT call OpenAI/Anthropic/Google directly. All calls go through `api.boldmind.ng/api/v1/polymind/*`. This:
- Keeps API keys server-side (never in extension bundle)
- Allows rate limiting per BoldmindNG API key
- Enables usage tracking + billing for PolyMind Pro tier

**New NestJS module needed:**
```
src/modules/polymind/
├── polymind.module.ts
├── polymind.controller.ts      ← POST /polymind/{provider}
└── polymind.service.ts         ← fans out to existing AI providers
```

```typescript
// POST /api/v1/polymind/:provider
// Auth: X-API-Key header (ApiKeyGuard)
// Body: { prompt: string, systemPrompt?: string, maxTokens?: number, temperature?: number }
// Response: { content: string, model: string, tokensUsed: number, latencyMs: number }

@Post(':provider')
@UseGuards(ApiKeyGuard)
async query(
  @Param('provider') provider: string,
  @Body() dto: PolyMindQueryDto,
  @Req() req: Request,
) {
  // Check scope: 'polymind:query' required
  const apiKey = req['apiKey'] as ApiKey;
  if (!apiKey.scopes.includes('polymind:query')) {
    throw new ForbiddenException('polymind:query scope required');
  }
  return this.polymindService.query(provider, dto);
}
```

### 10.6 Extension UI Flow

```
First Run:
  1. Popup opens → ApiKeySetup.tsx
  2. User clicks "Get your free API key" → opens boldmind.ng/developers in new tab
  3. User copies key → pastes into extension → saved to chrome.storage.local
  4. Extension validates key via GET /api/v1/developer/keys/validate

Normal Use:
  1. User opens popup (or side panel via toolbar)
  2. PromptInput.tsx — user types their prompt
  3. ModelSelector.tsx — toggle which models to compare (default: GPT-4o + Claude)
  4. Submit → ModelGrid.tsx shows loading skeletons per model
  5. Parallel API calls fire simultaneously (Promise.allSettled)
  6. Each model card fills in as response arrives (streaming preferred if supported)
  7. User can copy any response, rate models (👍👎), save comparison to history

Context Menu:
  - Right-click any selected text on any webpage
  - "Compare in PolyMind" → opens side panel with selected text as pre-filled prompt
```

### 10.7 Extension package.json

```json
{
  "name": "polymind-extension",
  "version": "1.0.0",
  "private": true,
  "packageManager": "pnpm@10.34.1",
  "engines": { "node": ">=22.22.3" },
  "scripts": {
    "dev":   "vite dev",
    "build": "vite build",
    "pack":  "vite build && cd dist && zip -r ../polymind.zip ."
  },
  "dependencies": {
    "react":        "19.2.x",
    "react-dom":    "19.2.x"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.x",
    "vite":               "^5.x",
    "typescript":         "^5.x"
  }
}
```

### 10.8 PolyMind Pricing (add to BOLDMIND_PRICING)

```typescript
// Add to pricing.ts:
{
  productSlug: 'polymind-extension',
  productName: 'Boldmind PolyMind',
  shortName:   'PolyMind',
  pillar:      'enablement',
  tiers: [
    {
      name:         'free',
      priceMonthly: { NGN: 0, USD: 0, EUR: 0 },
      priceYearly:  { NGN: 0, USD: 0, EUR: 0 },
      features: [
        '50 comparisons/month',
        '2 models at a time (GPT-4o + Claude)',
        'Basic history (last 10)',
      ],
    },
    {
      name:         'pro',
      badge:        'Most Popular',
      priceMonthly: { NGN: 3500, USD: 3, EUR: 3 },
      priceYearly:  { NGN: 35000, USD: 23, EUR: 22 },
      features: [
        'Unlimited comparisons',
        'All 5 models simultaneously',
        'Unlimited history + search',
        'Export comparisons as PDF',
        'Custom system prompts',
        'Prompt library integration',
      ],
    },
  ],
}
```

---

## 11. Prisma Schema — Addendum

These models are **NEW** and must be added to `prisma/schema.prisma` in the next migration. Reference the existing schema for style conventions (use the same enum patterns, @map conventions, @@index patterns already present).

```prisma
// ─── WALLET (Section 4) ──────────────────────────────────────────────────────

model Wallet {
  id              String        @id @default(cuid())
  userId          String        @unique
  balanceKobo     Int           @default(0)
  tier            WalletTier    @default(TIER1)
  dailyDebitKobo  Int           @default(0)
  lastDebitReset  DateTime      @default(now())
  isLocked        Boolean       @default(false)
  lockReason      String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  user    User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  ledger  WalletLedger[]

  @@map("wallets")
}

model WalletLedger {
  id            String            @id @default(cuid())
  walletId      String
  type          WalletEntryType
  amountKobo    Int
  balanceAfter  Int
  description   String
  reference     String?
  source        WalletSource
  metadata      Json?
  createdAt     DateTime          @default(now())

  wallet Wallet @relation(fields: [walletId], references: [id])

  @@index([walletId])
  @@index([walletId, createdAt])
  @@index([reference])
  @@map("wallet_ledger")
}

enum WalletTier       { TIER1 TIER2 }
enum WalletEntryType  { CREDIT DEBIT }
enum WalletSource {
  REFERRAL_COMMISSION
  AFFILIATE_EARNING
  SUBSCRIPTION_REFUND
  ADMIN_CREDIT
  PROMOTIONAL_BONUS
  MARKETPLACE_PAYOUT
  SUBSCRIPTION_PAYMENT
  MARKETPLACE_PURCHASE
  WITHDRAWAL
}

// ─── API KEYS (Section 8) ─────────────────────────────────────────────────────

model ApiKey {
  id          String    @id @default(cuid())
  userId      String
  name        String
  keyHash     String    @unique
  prefix      String                         // "bm_live_" + 8 random chars
  scopes      String[]
  tier        ApiTier   @default(STARTER)
  isActive    Boolean   @default(true)
  rateLimit   Int       @default(1000)
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([keyHash])
  @@map("api_keys")
}

enum ApiTier { STARTER GROWTH ENTERPRISE }

// ─── SCHOOL (Section 7.2) ─────────────────────────────────────────────────────

model School {
  id              String    @id @default(cuid())
  name            String
  state           String
  address         String?
  contactEmail    String
  adminUserId     String    @unique
  plan            String    @default("basic")
  studentSlots    Int       @default(50)
  usedSlots       Int       @default(0)
  payingUntil     DateTime?
  paystackSubCode String?   @unique
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  admin User @relation(fields: [adminUserId], references: [id])

  @@map("schools")
}

// ─── VIBE CODERS CLASSROOM (Section 7.5) ─────────────────────────────────────

model VibeCoderProjectSubmission {
  id          String   @id @default(cuid())
  applicantId String
  moduleId    String
  githubUrl   String?
  loomUrl     String?
  brief       String   @db.Text
  status      String   @default("submitted")
  mentorNote  String?  @db.Text
  reviewedBy  String?
  score       Int?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  applicant VibeCoderApplicant @relation(fields: [applicantId], references: [id])

  @@index([applicantId])
  @@map("vc_project_submissions")
}

model VibeCoderAttendance {
  id          String    @id @default(cuid())
  applicantId String
  sessionDate DateTime
  sessionType String
  moduleId    String
  attended    Boolean   @default(false)
  joinedAt    DateTime?
  duration    Int?
  createdAt   DateTime  @default(now())

  applicant VibeCoderApplicant @relation(fields: [applicantId], references: [id])

  @@unique([applicantId, sessionDate, moduleId])
  @@map("vc_attendance")
}

// ─── WEBHOOK SUBSCRIPTIONS (Section 8) ───────────────────────────────────────

model WebhookSubscription {
  id        String   @id @default(cuid())
  userId    String
  apiKeyId  String
  url       String
  events    String[]
  secret    String                          // HMAC secret for signing payloads
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user   User   @relation(fields: [userId], references: [id])
  apiKey ApiKey @relation(fields: [apiKeyId], references: [id])

  @@index([userId])
  @@map("webhook_subscriptions")
}

// ─── REFERRALS & AFFILIATES (Wave 1 backlog) ─────────────────────────────────

model Referral {
  id             String   @id @default(cuid())
  referrerId     String
  referredId     String   @unique
  productSlug    String
  status         String   @default("pending")  // pending | converted | paid
  commissionKobo Int      @default(0)
  createdAt      DateTime @default(now())

  referrer User @relation("Referrer", fields: [referrerId], references: [id])
  referred User @relation("Referred", fields: [referredId], references: [id])

  @@index([referrerId])
  @@map("referrals")
}

model AffiliateEarning {
  id          String    @id @default(cuid())
  userId      String
  source      String
  amountKobo  Int
  reference   String?
  paidAt      DateTime?
  createdAt   DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("affiliate_earnings")
}
```

**Relations to add to existing `User` model:**
```prisma
// Add to existing User model:
  wallet              Wallet?
  apiKeys             ApiKey[]
  school              School?               // if user is a school admin
  referralsMade       Referral[]            @relation("Referrer")
  referredBy          Referral?             @relation("Referred")
  affiliateEarnings   AffiliateEarning[]
  webhookSubscriptions WebhookSubscription[]
```

---

## 12. MongoDB Schemas — Addendum

Reference the existing schemas in `src/modules/` — these are ADDENDUMS only.

### 12.1 Prompt Template Schema (EduCenter)

```typescript
// src/modules/educenter/schemas/prompt-template.schema.ts

@Schema({ timestamps: true, collection: 'prompt_templates' })
export class PromptTemplate {
  @Prop({ required: true, unique: true }) slug: string;
  @Prop({ required: true })               title: string;
  @Prop({ required: true })               description: string;
  @Prop({ required: true })               category: string; // business|marketing|exam-prep|productivity
  @Prop({ required: true })               template: string; // with {{placeholders}}
  @Prop({ type: [String] })               variables: string[];
  @Prop({ default: false })               isPublic: boolean;
  @Prop({ default: false })               isPremium: boolean;
  @Prop({ default: 0 })                   usageCount: number;
  @Prop({ type: [String] })               tags: string[];
  @Prop()                                  authorId?: string;
}
```

### 12.2 Business Playbook Schema

```typescript
// src/modules/educenter/schemas/playbook.schema.ts

@Schema({ timestamps: true, collection: 'playbooks' })
export class Playbook {
  @Prop({ required: true, unique: true }) slug: string;
  @Prop({ required: true })               title: string;
  @Prop({ required: true })               description: string;
  @Prop({ required: true })               category: string;
  @Prop()                                  thumbnailUrl: string;
  @Prop({ default: false })               isPublic: boolean;   // true → visible without login
  @Prop({ default: false })               isPremium: boolean;  // true → Pro sub required
  @Prop({ required: true })               content: string;     // rich HTML/MDX
  @Prop({ type: Object })                 sections: Array<{ heading: string; body: string }>;
  @Prop({ type: [String] })               tags: string[];
  @Prop({ default: 0 })                   viewCount: number;
  @Prop({ default: 0 })                   downloadCount: number;
  @Prop()                                  authorId?: string;
  @Prop()                                  publishedAt?: Date;
}
```

### 12.3 PolyMind Comparison History Schema

```typescript
// src/modules/polymind/schemas/comparison.schema.ts
// Stored in MongoDB (high-write, semi-structured)

@Schema({ timestamps: true, collection: 'polymind_comparisons' })
export class PolyMindComparison {
  @Prop({ required: true })  userId: string;         // or apiKeyId for extension
  @Prop({ required: true })  prompt: string;
  @Prop()                     systemPrompt?: string;
  @Prop({ type: [Object] })  responses: Array<{
    modelId:    string;
    content:    string;
    tokensUsed: number;
    latencyMs:  number;
    error?:     string;
  }>;
  @Prop({ type: Object })    userRatings: Record<string, number>; // modelId → 1|0
  @Prop({ type: [String] })  savedModels: string[];  // which responses user saved
  @Prop({ default: 'web' })  source: string;         // 'extension' | 'web' | 'api'
}
```

### 12.4 API Webhook Delivery Log Schema

```typescript
// src/modules/api/schemas/webhook-delivery.schema.ts

@Schema({ timestamps: true, collection: 'webhook_deliveries' })
export class WebhookDelivery {
  @Prop({ required: true }) subscriptionId: string;
  @Prop({ required: true }) event: string;
  @Prop({ type: Object })   payload: Record<string, any>;
  @Prop({ required: true }) status: string;    // 'pending' | 'delivered' | 'failed'
  @Prop()                    responseCode?: number;
  @Prop()                    responseBody?: string;
  @Prop({ default: 0 })     attempts: number;
  @Prop()                    nextRetryAt?: Date;
  @Prop()                    deliveredAt?: Date;
}
```

---

## 13. Background Jobs — Updated Queue Map

Using **REDIS_QUEUE** instance for all BullMQ queues.

| Queue | Processor File | Priority | Retries | Notes |
|---|---|---|---|---|
| `email-notifications` | `automation/queue/email-campaign.processor.ts` | Normal | 3× exp | Via Resend |
| `sms-otp` | `notification/notification.service.ts` | High | 2× | WhatsApp→SMS fallback |
| `social-publishing` | `automation/queue/social-post.processor.ts` | Normal | 2× | Delayed jobs |
| `ai-generation` | `automation/queue/ai-jobs.processor.ts` | Normal | 2× | Provider fallback |
| `image-generation` | `ai/processors/social-factory.processor.ts` | Normal | 1× | fal.ai → DALL-E |
| `payroll-processing` | `planai/processors/planai.processor.ts` | High | 0 | Idempotent |
| `media-processing` | `media/media.service.ts` | Normal | 2× | R2 upload + scan |
| `payment-webhook` | `payment/payment.service.ts` | Critical | 5× 10s | Paystack retries 72hr |
| `wallet-credit` | `wallet/wallet.service.ts` | High | 3× | Must succeed |
| `trend-analysis` | `ai/services/trend.service.ts` | Low | 1× | Cron: every 2h |
| `kolo-reminders` | `villagecircle/kolo-ai/kolo-ai.service.ts` | Normal | 1× | WhatsApp reminders |
| `polymind-query` | `polymind/polymind.service.ts` | Normal | 1× | Fan-out AI calls |
| `webhook-delivery` | `api/webhook-delivery.service.ts` | Normal | 3× exp | Enterprise webhooks |
| `ndpa-erasure` | `user/user.service.ts` | Low | 0 | Cron: daily |
| `seo-sitemap` | `amebogist/rss.service.ts` | Low | 0 | Cron: nightly |

**New queue: `sms-otp`**

```typescript
// src/modules/notification/notification.service.ts (add alongside existing)

// Job payload:
interface OTPJobPayload {
  to:      string;   // E.164 phone
  code:    string;   // 6 digits
  purpose: OTPPurpose;
  name?:   string;
  userId?: string;   // for logging
}

// Processor:
// 1. Try WhatsApp (packages/sms WhatsAppProvider)
// 2. If fails: try Termii SMS (packages/sms TermiiProvider)
// 3. Update OTPVerification.metadata with channel used
// 4. If both fail: send email OTP (only for email_verify purpose)
```

---

## 14. Migration Wave Update

### Wave 0 — Redis Split (IMMEDIATE — do before any other migration)
1. Provision 3 Redis instances (Upstash free tier: 3 databases per account)
2. Update `src/database/redis.service.ts` to `RedisService` with 3 connections (see Section 3.2)
3. Update `src/app.module.ts` BullMQ config to use `redis.queue`
4. Migrate SSO relay keys, rate limit keys from old single Redis to `REDIS_SESSION`
5. Deploy → verify BullMQ workers still process jobs

### Wave 1 — Foundation Data Models (weeks 1–3)
6. Prisma migration: add `Wallet`, `WalletLedger`, `WalletTier`, `WalletEntryType`, `WalletSource` enums
7. Prisma migration: add `Referral`, `AffiliateEarning`
8. Prisma migration: add `ApiKey`, `ApiTier`, `WebhookSubscription`
9. Prisma migration: add `School`
10. Prisma migration: add `VibeCoderProjectSubmission`, `VibeCoderAttendance`
11. Build `src/modules/wallet/` (WalletModule, WalletService, WalletController)
12. Connect wallet credits to Paystack `charge.success` webhook processor
13. Build `packages/sms` (WhatsAppProvider + TermiiProvider + OTPService)
14. Update `auth.service.ts` sendOTP to use `packages/sms` OTPService

### Wave 2 — PlanAI Completion (weeks 3–7)
15. CRM full CRUD + WhatsApp sync (CRMContact, CRMInteraction already in schema)
16. HR & Payroll full flow (HREmployee, Payslip, LeaveRequest already in schema)
17. AI Business Agent (OpenAI Assistants API + BullMQ)
18. Business Intelligence Suite data unification
19. Marketplace full escrow (Paystack split payments)

### Wave 3 — Education Platform (weeks 5–9)
20. LMS Builder routes + API (uses existing Course/CourseLesson/CourseEnrollment models)
21. AI Course Generator job (queues to `ai-generation`)
22. School Management Portal (new `School` model)
23. Prompt Library MongoDB schema + public/gated API
24. Business Playbook MongoDB schema + content
25. Vibe Coders Classroom API (project submissions + attendance)

### Wave 4 — Enterprise API & PolyMind (weeks 8–12)
26. `src/modules/api/` (ApiKey guard, enterprise endpoints, webhook delivery)
27. `packages/api-docs` (OpenAPI spec generation)
28. Developer portal pages in boldmind-web
29. Changelog page in boldmind-web
30. `src/modules/polymind/` (proxy endpoints for all AI models)
31. `polymind-extension` repo (Chrome extension build)
32. Submit PolyMind to Chrome Web Store

### Wave 5 — VillageCircle Concepts (weeks 10–16)
33. KoloAI → BUILDING (model + API + WhatsApp reminders)
34. ReceiptGenius VAT receipts (PDF + WhatsApp delivery)
35. BorderlessRemit rate aggregation
36. PowerAlert crowd-sourced data + push notifications
37. FarmGate produce listings + GIG Logistics

### Wave 6 — Platform Hardening (ongoing)
38. PgBouncer in front of Neon PostgreSQL
39. Full NDPA erasure pipeline (ndpa-erasure cron job)
40. PostHog session replays enabled
41. Datadog/Axiom structured logging
42. Load test with k6 targeting 1000 concurrent users

---

## 15. Master Output Checklist (Updated)

Use this checklist for EVERY code generation task, PR, scaffold, or AI-generated output.

### SECTION A — Foundation (ALL tasks)

```
[ ] A1. STACK VERSIONS — next: 16.2, react: 19.2, pnpm: 10.34.1, node: 22.22.3
        Never generate code using Next.js 14 patterns (pages router, getStaticProps, etc.)
        Always use App Router: layout.tsx, page.tsx, route.ts, loading.tsx, error.tsx

[ ] A2. PRODUCTS CONSTANT — All product names, slugs, descriptions, colors, prices
        read from BOLDMIND_PRODUCTS / BOLDMIND_PRICING / BOLDMIND_COLOR_SCHEMES.
        NEVER hardcoded. Attach products.ts, pricing.ts, colors.ts to every AI prompt.

[ ] A3. REPO BOUNDARY — Code lives in the correct repo.
        Check the project tree before inventing file paths.
        Always attach the relevant project-tree.md to any prompt generating files.

[ ] A4. SCHEMA ALIGNMENT — Field names match prisma/schema.prisma exactly.
        Monetary fields: check if *NGN (actually kobo) vs *Kobo convention.
        The schema uses NGN suffix but stores kobo. Display with formatNaira().

[ ] A5. AMOUNTS — Storage: kobo (integer). Display: formatNaira(kobo) → ₦12,500.
        NEVER display raw kobo to users. NEVER store naira floats.

[ ] A6. TIMEZONE — All timestamps stored UTC. All display formatted Africa/Lagos.
        Use formatLagosDate() from packages/utils/src/formatters/date.ts

[ ] A7. MOBILE FIRST — Functional at 375px minimum width.
        Touch targets ≥ 44×44px. Font ≥ 14px body (16px inputs).
        Test at 375px before 1280px.
```

### SECTION B — Auth & SSO

```
[ ] B1. JWT ACCESS — 15-minute expiry. Never persist in localStorage.
        Store in memory (Zustand auth store in packages/auth/src/store.ts).

[ ] B2. SSO COOKIE — boldmind_sso set/cleared ONLY by boldmind-service.
        Frontend NEVER reads or writes this cookie directly.

[ ] B3. RELAY TOKEN — One-time use. Deleted from REDIS_SESSION on exchange.
        External apps exchange at /sso/route.ts (confirmed in boldmind-web tree).

[ ] B4. OTP ORDER — WhatsApp first (packages/sms WhatsAppProvider),
        SMS fallback (TermiiProvider), Email fallback (email_verify only).
        Log which channel delivered in OTPVerification.metadata.

[ ] B5. PROTECTED ROUTES — middleware.ts in each Next.js app.
        createAuthMiddleware from @boldmindng/auth.
        (boldmind-web: dashboard/*, admin/*)
        (planai-suite: start/*, receptionist/*)
        (educenter-web: dashboard/*, lms/*, school/*)
        (villagecircle-web: vibe-coders/portal/*)

[ ] B6. GOOGLE OAUTH BUG FIX — Use buildSsoRelayUrl (not createRelayToken x2)
        for cross-domain redirects after OAuth. See Section 2.4 of master doc.
```

### SECTION C — Redis

```
[ ] C1. THREE REDIS INSTANCES — Always use the correct one:
        REDIS_SESSION: SSO tokens, OTP, rate limits, feature flags
        REDIS_QUEUE:   BullMQ (injected via RedisService.queue)
        REDIS_CACHE:   ALOC questions, rates, computed stats

[ ] C2. BULLMQ CONNECTION — BullMQ ONLY uses redis.queue instance.
        Never pass redis.session or redis.cache to BullMQ.

[ ] C3. KEY NAMING — Follow pattern: {namespace}:{entity}:{id}
        Examples: sso:relay:abc123, ratelimit:login:userId, aloc:maths:JAMB:2025
```

### SECTION D — Wallet

```
[ ] D1. WALLET MUTATIONS — Always inside Prisma $transaction.
        Never update balance without creating a WalletLedger entry.

[ ] D2. DAILY CAP — Check dailyDebitKobo + resetDailyDebitIfNeeded before every debit.
        TIER1 cap: ₦50,000/day (5,000,000 kobo). TIER2: ₦5,000,000/day.

[ ] D3. WALLET CREDIT ON PAYMENT — In payment-webhook processor, after charge.success,
        credit wallet if productSlug = 'wallet-topup'. Do NOT credit for subscriptions.

[ ] D4. WALLET DISPLAY — Frontend reads from GET /api/v1/wallet.
        Dashboard wallet page: app/(dashboard)/dashboard/wallet/page.tsx (boldmind-web).
```

### SECTION E — API & File Structure

```
[ ] E1. API RESPONSE SHAPE — Success: data directly (not wrapped).
        Error: { statusCode, message, error, timestamp, path }.
        Paginated: { data, total, page, pageSize, totalPages, hasNext, hasPrev }.

[ ] E2. DTO VALIDATION — All DTOs use class-validator decorators.
        Strings: @IsString() @IsNotEmpty(). Phone: @IsPhoneNumber('NG').
        Email: @IsEmail(). Money: @IsInt() @Min(1) (kobo).

[ ] E3. ENTERPRISE API — Routes under /api/v1/public/* use ApiKeyGuard.
        Routes under /api/v1/developer/* use JwtAuthGuard (manage API keys).
        Scopes checked per endpoint before processing.

[ ] E4. FILE PATHS (confirmed from project trees):
        boldmind-web SSO exchange: app/sso/route.ts
        boldmind-web API routes:   app/api/auth/{google,logout,sso/relay}/route.ts
        planai-suite layout:       app/planai-landingLayout.tsx
        educenter layout:          app/educenterLayout.tsx
        villagecircle layout:      app/villagecircleLayout.tsx
        amebogist layout:          app/amebogistLayout.tsx
```

### SECTION F — EduCenter Specifics

```
[ ] F1. PROMPT LIBRARY GATING — First 6 prompts: isPublic=true (no auth needed).
        Remaining prompts: require auth (JWT). Premium prompts: require Pro subscription.
        Gate in API: return limited list for anonymous, full list for authenticated.

[ ] F2. COURSE GATING — Same pattern as prompts.
        First 6 courses public, rest auth-gated, premium courses sub-gated.

[ ] F3. PLAYBOOK GATING — Same pattern. PUBLIC_PLAYBOOK_SLUGS constant = 6 items.
        Download (PDF) is Pro-only regardless of authentication.

[ ] F4. ALOC CACHING — Redis CACHE instance. Key: aloc:{subject}:{examType}:{year}.
        TTL: 24 hours. On miss: fetch from ALOC → cache → return. On ALOC down: 503.

[ ] F5. SCHOOL PORTAL — adminUserId is unique — one user = one school admin.
        schoolId on UserProfile links students to school.
        Student slots enforced: usedSlots < studentSlots before enrollment.

[ ] F6. VIBE CODERS CLASSROOM — Protected at /vibe-coders/portal/*.
        Requires VibeCoderApplicant.status = ENROLLED.
        Curriculum data from lib/vibe-coders/curriculum-data.ts (static, not API).
```

### SECTION G — PolyMind Extension

```
[ ] G1. AUTH METHOD — Extension uses X-API-Key (NOT JWT SSO).
        API key stored in chrome.storage.local (NOT localStorage, NOT cookies).

[ ] G2. ALL AI CALLS PROXIED — Never call OpenAI/Anthropic/Google directly from extension.
        All calls → api.boldmind.ng/api/v1/polymind/:provider.

[ ] G3. PARALLEL CALLS — Use Promise.allSettled() for simultaneous model calls.
        Each model card updates independently as response arrives.
        Streaming preferred but not required for v1.

[ ] G4. SCOPE — Extension API key must have 'polymind:query' scope.
        Check in ApiKeyGuard before processing any /polymind/* request.

[ ] G5. MANIFEST V3 — Service worker in background/service-worker.ts.
        No background page. No XMLHttpRequest in content scripts.
        Use fetch() only. Use chrome.runtime.sendMessage for content→popup comms.
```

### SECTION H — Changeset & Docs

```
[ ] H1. CHANGESET WORKFLOW — When changing any package in boldmind-shared:
        1. pnpm changeset (creates .changeset/*.md)
        2. pnpm changeset version (bumps version + updates CHANGELOG.md)
        3. pnpm changeset publish (publishes to GitHub Packages)

[ ] H2. CHANGELOG PAGE — /changelog in boldmind-web reads structured data
        from packages/api-docs/src/changelog.ts (parsed from CHANGELOG.md files).
        ISR: revalidate every 3600 seconds.

[ ] H3. DEVELOPER DOCS — /developers in boldmind-web.
        Rendered from OpenAPI spec (auto-generated by NestJS @ApiProperty decorators).
        Uses @scalar/api-reference component.
        New API endpoints must have @ApiOperation, @ApiResponse decorators.
```

### SECTION I — Security

```
[ ] I1. API KEY STORAGE — Only SHA-256 hash stored in DB (ApiKey.keyHash).
        Full key shown ONCE on creation. Never returned again.
        Prefix (first 8 chars) used for display and rate limiting.

[ ] I2. WEBHOOK SIGNATURES — Outgoing enterprise webhooks signed with HMAC-SHA256
        using WebhookSubscription.secret. Header: X-BoldmindNG-Signature.

[ ] I3. BVN/NIN — Never stored plain. Only bcrypt hash stored.
        Never returned in any API response.

[ ] I4. WALLET LOCK — isLocked=true wallets reject ALL debits with 403.
        Lock/unlock is admin-only action. lockReason is mandatory on lock.

[ ] I5. PAYSTACK WEBHOOK SIGNATURE — HMAC-SHA512 of raw body using PAYSTACK_SECRET.
        Verified BEFORE pushing to payment-webhook queue. Return 400 immediately if invalid.
```

---

*BoldmindNG System Design v2.0 | June 2026*
*Next review trigger: Any change to products.ts, pricing.ts, colors.ts, or schema.prisma*
*Always attach project tree files when generating code for any repo*




### Current State vs Required State

| File | Status | Notes |
|---|---|---|
| `src/admin.api.ts` | ✅ Exists | Covers admin endpoints §4.16 |
| `src/amebogist.api.ts` | ✅ Exists | Covers §4.12 |
| `src/analytics.api.ts` | ✅ Exists | Covers §4.9 |
| `src/auth.api.ts` | ✅ Exists | Covers §4.1 + §4.2 |
| `src/automation.api.ts` | ✅ Exists | Covers §4.11 |
| `src/client.ts` | ✅ Exists | **Needs dual-auth update — see below** |
| `src/educenter.api.ts` | ✅ Exists | Covers CBT + courses (existing) |
| `src/fitness.api.ts` | ✅ Exists | Covers planai fitness tool |
| `src/hub.api.ts` | ✅ Exists | Covers §4.4 |
| `src/interceptors.ts` | ✅ Exists | 401 retry + token refresh |
| `src/media.api.ts` | ✅ Exists | Covers §4.7 |
| `src/n8n-client.ts` | ✅ Exists | n8n trigger |
| `src/notifications.api.ts` | ✅ Exists | Covers §4.8 |
| `src/os.api.ts` | ✅ Exists | Project manager / OS profile |
| `src/payment.api.ts` | ✅ Exists | Covers §4.5 |
| `src/planai.api.ts` | ✅ Exists | Suite + all 13 tool endpoints |
| `src/users.api.ts` | ✅ Exists | Covers §4.3 |
| `src/vibecoders.api.ts` | ✅ Exists | Application pipeline |
| `src/villagecircle.api.ts` | ✅ Exists | Sub-modules |
| `src/wallet.api.ts` | ⚡ **MISSING** | Create — §4.6 |
| `src/developer.api.ts` | ⚡ **MISSING** | Create — §4.17 |
| `src/polymind.api.ts` | ⚡ **MISSING** | Create — §4.18 |
| `src/educenter-lms.api.ts` | ⚡ **MISSING** | Create — LMS builder endpoints |
| `src/educenter-school.api.ts` | ⚡ **MISSING** | Create — school portal endpoints |

---

## 16. Missing Modules Table (Complete)

```

| Module | Path in boldmind-service | Wave | Prisma Changes Needed | Notes |
|---|---|---|---|---|
| **Redis split** | `src/database/redis.service.ts` | **0 — IMMEDIATE** | none | Rewrite existing to 3 instances |
| **Queue constants** | `src/common/constants/queues.ts` | **0 — IMMEDIATE** | none | Add 4 new constants |
| **Wallet** | `src/modules/wallet/` | 1 | `Wallet`, `WalletLedger`, 3 enums | Full CRUD + ledger |
| **Referrals** | `src/modules/user/referral.service.ts` | 1 | `Referral`, `AffiliateEarning` | Attach to UserModule |
| **OTP WhatsApp chain** | `src/modules/notification/notification.service.ts` | 1 | none | Upgrade existing `sendOTP()` |
| **SMS OTP queue processor** | `src/modules/notification/` | 1 | none | New BullMQ processor |
| **EduCenter LMS** | `src/modules/educenter/lms/` | 3 | none (Course models exist) | New sub-controller |
| **EduCenter School** | `src/modules/educenter/school/` | 3 | `School` model | New sub-controller |
| **Prompt Library schemas** | `src/modules/educenter/schemas/` | 3 | MongoDB only | `PromptTemplate`, `Playbook` |
| **Vibe Coders Classroom** | Extend `villagecircle/vibecoders/` | 3 | `VibeCoderProjectSubmission`, `VibeCoderAttendance` | Extend existing controller |
| **API Keys** | `src/modules/api/api-key/` | 4 | `ApiKey`, `ApiTier` enum | Enterprise Developer API |
| **Webhooks** | `src/modules/api/webhook/` | 4 | `WebhookSubscription` + MongoDB delivery log | |
| **Enterprise routes** | `src/modules/api/enterprise/` | 4 | none | Public scoped API |
| **PolyMind proxy** | `src/modules/polymind/` | 4 | none | MongoDB comparison history |
| **Changelog page data** | `src/modules/hub/hub.service.ts` | 4 | `SystemStatus` (lightweight) | Feeds `/hub/changelog` endpoint |
| **Developer docs** | `boldmind-web` (not service) | 4 | none | `/developers/*` pages |

**Note on `kolo-ai/translation.schema.ts`:** The canonical doc flags this schema filename as probably incorrect — it should be `kolo-group.schema.ts`. When building the KoloAI Wave 5 feature, rename it and update all imports in the module.
```
---

## 17. API Reference Cross-Reference
---
The `boldmind-service-canonical.md` contains the **full API reference** for all 18 endpoint groups. The system-design-v2 only summarises. When generating code for any endpoint, use the canonical doc as the source of truth for:

- Exact request body shape
- Exact response shape
- Auth requirement
- Side effects (what BullMQ jobs fire, what notifications send)

Quick lookup:

| Section | Groups Covered |
|---|---|
| §4.1 | Auth (register, login, refresh, logout, verify, reset, 2FA, Google OAuth) |
| §4.2 | SSO (relay, exchange, verify, logout-all) |
| §4.3 | User / Me (admin user mgmt + self-service) |
| §4.4 | Hub (dashboard, products, ecosystem, referral, waitlist, changelog) |
| §4.5 | Payment & Subscription |
| §4.6 | Wallet ⚡ MISSING |
| §4.7 | Media |
| §4.8 | Notification (push, email, OTP) |
| §4.9 | Analytics |
| §4.10 | AI (generate, image, social caption, trends) |
| §4.11 | Automation (social schedule, email campaigns, n8n) |
| §4.12 | Amebogist (posts, reactions, comments, creator) |
| §4.13 | EduCenter (CBT, courses, LMS, school, prompts, playbooks) |
| §4.14 | PlanAI (all 13 tools — social, ads, brand, intelligence, investor, marketing, directory, agent, projects, CRM, HR, fitness, marketplace) |
| §4.15 | VillageCircle (waitlist, vibecoders pipeline, kolo, remit, receipts, safeai, farmgate, gig) |
| §4.16 | Admin |
| §4.17 | Developer / Enterprise API ⚡ MISSING |
| §4.18 | PolyMind Proxy ⚡ MISSING |

---

## 18. Cross-App Package Usage Matrix

| Package | boldmind-web | planai-suite | amebogist-web | educenter-web | villagecircle-web | boldmind-service | polymind-extension |
|---|---|---|---|---|---|---|---|
| `@boldmindng/utils` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (products/pricing only) | ➖ |
| `@boldmindng/ui` | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ (own React UI) |
| `@boldmindng/auth` | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ |
| `@boldmindng/api-client` | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ (apikey mode) |
| `@boldmindng/analytics` | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ➖ |
| `@boldmindng/email` | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ only | ➖ |
| `@boldmindng/payments` | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ only | ➖ |
| `@boldmindng/sms` | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ only | ➖ |
| `@boldmindng/wallet` | ✅ | ➖ | ➖ | ➖ | ➖ | ➖ (Prisma directly) | ➖ |
| `@boldmindng/api-docs` | ✅ (changelog + docs) | ➖ | ➖ | ➖ | ➖ | ➖ (source of OpenAPI) | ➖ |
| `@boldmindng/pwa` | ✅ | ➖ | ✅ (TWA) | ✅ (TWA) | ➖ | ➖ | ➖ |
| `@boldmindng/deploy-config` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |

**Key rules from this matrix:**
- `email`, `payments`, `sms` are **server-side only** — never import in frontend repos
- `wallet` is **client-side helper only** — never talks to DB (uses api-client internally)
- `polymind-extension` uses `api-client` in `apikey` mode — no other shared packages
- `boldmind-service` uses `utils` only for `BOLDMIND_PRODUCTS` / `BOLDMIND_PRICING` constants — never imports `ui` or `auth`

---

## 19. Tooling Packages

These three tooling packages exist in `boldmind-shared/tooling/` and are consumed by every repo:

### `@boldmindng/eslint-config` (`tooling/eslint-config/`)

```javascript
// tooling/eslint-config/index.js
// Extends: next/core-web-vitals, turbo
// Custom rules:
//   - Ban localStorage/sessionStorage in packages/ui, packages/auth, packages/pwa
//     (enforces CRITICAL_BROWSER_STORAGE rule from system design)
//   - Require data-product attribute on root layout elements

// Usage in each repo:
// eslint.config.js: export default require('@boldmindng/eslint-config')
```

### `@boldmindng/tailwind-config` (`tooling/tailwind-config/`)

```typescript
// tooling/tailwind-config/src/preset.ts
// Derives Tailwind colors FROM colors.ts BOLDMIND_COLOR_SCHEMES (never hardcode hex)
// Adds font families: jakarta, inter, playfair, lora, dyslexic, mono
// Adds screens: mobile (375px), sm, md, lg, xl, 2xl

// Usage in each repo:
// tailwind.config.js: { presets: [require('@boldmindng/tailwind-config').preset] }
```

### `@boldmindng/tsconfig` (`tooling/tsconfig/`)

| File | Extends | Used by |
|---|---|---|
| `base.json` | — | Root `tsconfig.json` of all repos |
| `node-library.json` | `base.json` | `api-client`, `payments`, `sms`, `wallet`, `api-docs`, `deploy-config` |
| `react-library.json` | `base.json` | `ui`, `pwa` (DOM + React JSX) |

```jsonc
// Usage in each package's tsconfig.json:
{
  "extends": "@boldmindng/tsconfig/react-library.json"
}
```

---
