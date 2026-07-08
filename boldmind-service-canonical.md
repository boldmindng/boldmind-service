# boldmind-service — Canonical Reference

## Project Structure · Implementation Flow · Full API Documentation

**Aligned with boldmind-system-design-v2.1-merged.md | June 2026 | v1.1 (updated)**
**Stack: NestJS 10 · Prisma 6 · Node 22.22.3 · pnpm 10.34.1**

> **UPDATE NOTE (v1.1):** Sections 3–5 have been added from
> `boldmind-system-design-v2-alignment-addendum.md` (§F, §K, §L). They give this service its
> own copies of the Redis/queue reference implementation, the two launch-blocking known issues
> that live in this repo's controllers, and the complete environment variable list — so this
> file can be used standalone as the service's operational reference, not just its API
> reference. See `boldmind-system-design-v2-merged.md` for the full cross-repo version.

---

## Table of Contents

- [boldmind-service — Canonical Reference](#boldmind-service--canonical-reference)
  - [Project Structure · Implementation Flow · Full API Documentation](#project-structure--implementation-flow--full-api-documentation)
  - [Table of Contents](#table-of-contents)
  - [1. Complete Project Structure](#1-complete-project-structure)
  - [2. Full API Reference](#2-full-api-reference)
    - [4.1 Auth](#41-auth)
    - [4.2 SSO](#42-sso)
    - [4.3 User / Me](#43-user--me)
    - [4.4 Hub](#44-hub)
    - [4.5 Payment \& Subscription](#45-payment--subscription)
    - [4.6 Wallet ⚡ MISSING](#46-wallet--missing)
    - [4.7 Media](#47-media)
    - [4.8 Notification](#48-notification)
    - [4.9 Analytics](#49-analytics)
    - [4.10 AI](#410-ai)
    - [4.11 Automation](#411-automation)
    - [4.12 Amebogist](#412-amebogist)
    - [4.13 EduCenter](#413-educenter)
    - [4.14 PlanAI Suite](#414-planai-suite)
    - [4.15 VillageCircle Sub-modules](#415-villagecircle-sub-modules)
    - [4.16 Admin](#416-admin)
    - [4.17 Developer / Enterprise API ⚡ MISSING](#417-developer--enterprise-api--missing)
    - [4.18 PolyMind Proxy ⚡ MISSING](#418-polymind-proxy--missing)
  - [3. Redis \& Queue Reference Implementation](#3-redis--queue-reference-implementation)
    - [3.1 `src/database/redis.service.ts` — Complete File](#31-srcdatabaseredisservicets--complete-file)
    - [3.2 `src/common/constants/queues.ts` — Complete File](#32-srccommonconstantsqueuests--complete-file)
  - [4. Known Issues — Launch Blockers in This Repo](#4-known-issues--launch-blockers-in-this-repo)
    - [4.1 Google OAuth Double-Call Bug — `auth.controller.ts` (BLOCKING)](#41-google-oauth-double-call-bug--authcontrollerts-blocking)
    - [4.2 `kolo-ai/translation.schema.ts` — Probable Misnaming](#42-kolo-aitranslationschemats--probable-misnaming)
  - [5. Environment Variables — Complete Checklist](#5-environment-variables--complete-checklist)

---

## 1. Complete Project Structure

```
boldmind-service/
│
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   ├── migrations/
│   │   ├── 20260312113544_new/
│   │   ├── 20260428153216_safeai_villagecirle/
│   │   ├── 20260428160307_viralkit/
│   │   └── 20260612094453_hr_crm_contact/
│   └── migration_lock.toml
│
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── common/
│   │   ├── constants/
│   │   │   └── queues.ts
│   │   ├── decorators/
│   │   │   ├── index.ts                     ✅
│   │   │   ├── permissions.decorator.ts     ✅
│   │   │   ├── public.decorator.ts          ✅
│   │   │   ├── roles.decorator.ts           ✅
│   │   │   └── user.decorator.ts            ✅
│   │   ├── filters/
│   │   │   └── http.exception.filter.ts     ✅
│   │   ├── interceptors/
│   │   │   ├── logging.interceptor.ts       ✅
│   │   │   └── response.interceptor.ts      ✅
│   │   └── utils/
│   │       └── slug.util.ts                 ✅
│   │
│   ├── database/
│   │   ├── database.module.ts               ✅
│   │   ├── prisma.service.ts                ✅
│   │   ├── redis.service.ts                 ✅
│   │   └── validate-env.ts                  ✅
│   │
│   ├── types/
│   │   └── express-multer.d.ts              ✅
│   │
│   └── modules/
│       │
│       ├── admin/
│       │   ├── admin.controller.ts
│       │   ├── admin.module.ts
│       │   ├── admin.service.ts
│       │   └── health.controller.ts
│       │
│       ├── ai/
│       │   ├── ai.controller.ts
│       │   ├── ai.module.ts
│       │   ├── ai.service.ts
│       │   ├── ai-job.schema.ts
│       │   ├── prompt-template.schema.ts
│       │   ├── processors/
│       │   │   └── social-factory.processor.ts
│       │   ├── providers/
│       │   │   ├── cloudflare.provider.ts
│       │   │   ├── fal.provider.ts
│       │   │   ├── gemini.provider.ts
│       │   │   ├── groq.provider.ts
│       │   │   ├── ollama.provider.ts
│       │   │   └── openai.provider.ts
│       │   └── services/
│       │       ├── trend.service.ts
│       │       └── video-factory.service.ts
│       │
│       ├── amebogist/
│       │   ├── amebogist.controller.ts
│       │   ├── amebogist.module.ts
│       │   ├── amebogist.service.ts
│       │   ├── rss.service.ts
│       │   ├── dto/
│       │   │   └── index.ts
│       │   ├── schemas/
│       │   │   ├── comment.schema.ts        ✅
│       │   │   ├── creator-stats.schema.ts  ✅
│       │   │   ├── post.schema.ts           ✅
│       │   │   └── reaction.schema.ts       ✅
│       │   ├── scripts/
│       │   └── backups/
│       │
│       ├── analytics/                       ✅
│       │   ├── analytics.controller.ts
│       │   ├── analytics.module.ts
│       │   └── analytics.service.ts
│       │
│       ├── auth/                            ✅
│       │   ├── auth.controller.ts
│       │   ├── auth.guard.ts
│       │   ├── auth.module.ts
│       │   ├── auth.service.ts
│       │   ├── jwt-auth.guard.ts
│       │   ├── permissions.guard.ts
│       │   ├── roles.guard.ts
│       │   ├── dto/
│       │   │   ├── auth.dto.ts
│       │   │   ├── login.dto.ts
│       │   │   └── register.dto.ts
│       │   ├── sso/
│       │   │   ├── sso.controller.ts
│       │   │   └── sso.service.ts
│       │   └── strategies/
│       │       ├── google.strategy.ts
│       │       └── jwt.strategy.ts
│       │
│       ├── automation/                      ✅
│       │   ├── automation.controller.ts
│       │   ├── automation.module.ts
│       │   ├── automation.service.ts
│       │   ├── queue/
│       │   │   ├── ai-jobs.processor.ts
│       │   │   ├── email-campaign.processor.ts
│       │   │   └── social-post.processor.ts
│       │   └── schema/
│       │       └── n8n_logs.schema.ts
│       │
│       ├── educenter/                       ✅
│       │   ├── educenter.controller.ts
│       │   ├── educenter.module.ts
│       │   ├── educenter.service.ts
│       │   ├── dto/
│       │   │   └── educenter.dto.ts
│       │   └── services/
│                   └── aloc.service.ts
│               lms/
│       │       ├── lms.controller.ts
│       │   │   ├── lms.service.ts
│       │   │   └── dto/lms.dto.ts
│       │   └── school/
│       │       ├── school.controller.ts
│       │       ├── school.service.ts
│       │       └── dto/school.dto.ts
│       ├── hub/
│       │   ├── hub.controller.ts
│       │   ├── hub.module.ts
│       │   └── hub.service.ts
│       │
│       ├── media/                           ✅ EXISTS
│       │   ├── media.controller.ts
│       │   ├── media.module.ts
│       │   └── media.service.ts
│       │
│       ├── notification/                    ✅ EXISTS (OTP fallback chain missing)
│       │   ├── notification.controller.ts
│       │   ├── notification.module.ts
│       │   ├── notification.service.ts      ← update: add WhatsApp-first OTP chain
│       │   └── dto/
│       │       ├── send-email.dto.ts
│       │       └── send-push.dto.ts
│       │
│       ├── payment/                         ✅ EXISTS
│       │   ├── payment.controller.ts
│       │   ├── payment.dto.ts
│       │   ├── payment.module.ts
│       │   ├── payment.service.ts
│       │   └── subscription.service.ts
│       │
│       ├── planai/
│       │   ├── planai.module.ts
│       │   ├── planai.types.ts
│       │   ├── controllers/
│       │   │   ├── ads-center.controller.ts
│       │   │   ├── biz-agent.controller.ts
│       │   │   ├── biz-directory.controller.ts
│       │   │   ├── biz-intel.controller.ts
│       │   │   ├── brand-home.controller.ts
│       │   │   ├── fitness-center.controller.ts
│       │   │   ├── hr-payroll.controller.ts
│       │   │   ├── investor-kit.controller.ts
│       │   │   ├── marketing-auto.controller.ts
│       │   │   ├── marketplace.controller.ts
│       │   │   ├── plan-crm.controller.ts
│       │   │   ├── planai-suite.controller.ts
│       │   │   ├── project-manager.controller.ts
│       │   │   ├── social-media.controller.ts
│       │   │   └── tools.controller.ts
│       │   ├── dto/
│       │   │   └── all-planai.dto.ts
│       │   ├── processors/
│       │   │   └── planai.processor.ts
│       │   ├── services/
│       │   │   ├── ads-center.service.ts
│       │   │   ├── biz-agent.service.ts
│       │   │   ├── biz-directory.service.ts
│       │   │   ├── biz-intel.service.ts
│       │   │   ├── brand-home.service.ts
│       │   │   ├── fitness-center.service.ts
│       │   │   ├── hr-payroll.service.ts
│       │   │   ├── investor-kit.service.ts
│       │   │   ├── marketing-auto.service.ts
│       │   │   ├── marketplace.service.ts
│       │   │   ├── plan-crm.service.ts
│       │   │   ├── planai-analytics.service.ts
│       │   │   ├── planai-job.service.ts
│       │   │   ├── planai-suite.service.ts
│       │   │   ├── planai-template.service.ts
│       │   │   ├── project-manager.service.ts
│       │   │   └── social-media.service.ts
│       │   └── social-media-manager/
│       │       └── metawebhook.service.ts
│       │
│       ├── user/
│       │   ├── user-me.controller.ts
│       │   ├── user.controller.ts
│       │   ├── user.dto.ts
│       │   ├── user.module.ts
│       │   └── user.service.ts
│       │
│       ├── villagecircle/                   ✅ EXISTS (10 sub-modules)
│       │   ├── villagecircle.module.ts
│       │   ├── afrohustle/
│       │   │   ├── afrohustle.controller.ts
│       │   │   ├── afrohustle.service.ts
│       │   │   └── blueprint.schema.ts
│       │   ├── borderless-remit/
│       │   │   ├── borderless-remit.controller.ts
│       │   │   ├── borderless-remit.service.ts
│       │   │   └── transfer.schema.ts
│       │   ├── farmgate/
│       │   │   ├── farmgate.controller.ts
│       │   │   ├── farmgate.service.ts
│       │   │   └── produce-listing.schema.ts
│       │   ├── kolo-ai/
│       │   │   ├── kolo-ai.controller.ts
│       │   │   ├── kolo-ai.service.ts
│       │   │   └── translation.schema.ts    ← NOTE: probably meant kolo-group.schema.ts
│       │   ├── naijagig/
│       │   │   ├── naijagig.controller.ts
│       │   │   ├── naijagig.service.ts
│       │   │   └── gig.schema.ts
│       │   ├── receiptgenius/
│       │   │   ├── receiptgenius.controller.ts
│       │   │   ├── receiptgenius.service.ts
│       │   │   └── receipt.schema.ts
│       │   ├── safeai/
│       │   │   ├── safeai.controller.ts
│       │   │   └── safeai.service.ts
│       │   ├── skill2cash/
│       │   │   ├── skill2cash.controller.ts
│       │   │   ├── skill2cash.service.ts
│       │   │   └── video-profile.schema.ts
│       │   ├── vibecoders/
│       │   │   ├── vibecoders.controller.ts
│       │   │   └── vibecoders.service.ts
│       │   └── waitlist/
│       │       └── waitlist.controller.ts
│       │
│       │
│       ├── wallet/
│       │   ├── wallet.controller.ts
│       │   ├── wallet.module.ts
│       │   ├── wallet.service.ts
│       │   └── dto/wallet.dto.ts
│       │
│       ├── api/
│       │   ├── api.module.ts
│       │   ├── api-key/
│       │   │   ├── api-key.controller.ts
│       │   │   ├── api-key.service.ts
│       │   │   └── api-key.guard.ts
│       │   ├── enterprise/
│       │   │   ├── enterprise.controller.ts
│       │   │   └── enterprise.service.ts
│       │   ├── rate-limit/
│       │   │   └── api-rate-limit.guard.ts
│       │   └── webhook/
│       │       ├── webhook.controller.ts
│       │       ├── webhook.service.ts
│       │       └── schemas/webhook-delivery.schema.ts
│       │
│       └── polymind/
│           ├── polymind.controller.ts
│           ├── polymind.module.ts
│           ├── polymind.service.ts
│           ├── polymind.dto.ts
│           └── schemas/
│               └── comparison.schema.ts
│
├── .env
├── .gitignore
├── .npmrc
├── Dockerfile
├── nest-cli.json
├── package.json
├── pnpm-lock.yaml
├── prisma.config.ts
├── railway.toml
├── TEST.TS
├── tsconfig.build.json
└── tsconfig.json
```

---

## 2. Full API Reference

**Base URL:** `https://api.boldmind.ng/api/v1`

**Auth header:** `Authorization: Bearer <jwt>` (15-min access token)

**API key header:** `X-API-Key: bm_live_xxxxxxxxxx` (enterprise/developer API only)

**Standard error shape:**

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-06-14T10:00:00.000Z",
  "path": "/api/v1/..."
}
```

**Standard paginated response:**

```json
{
  "data": [...],
  "total": 120,
  "page": 1,
  "pageSize": 20,
  "totalPages": 6,
  "hasNext": true,
  "hasPrev": false
}
```

---

### 4.1 Auth

**Module:** `src/modules/auth/` **Controller:** `auth.controller.ts`

| Method | Path                    | Auth   | Body / Query                        | Returns                               | Notes                    |
| ------ | ----------------------- | ------ | ----------------------------------- | ------------------------------------- | ------------------------ | --- |
| POST   | `/auth/register`        | Public | `{ email, password, name, phone? }` | `{ user, accessToken, refreshToken }` | Sends email verify OTP   |
| POST   | `/auth/login`           | Public | `{ email, password }`               | `{ user, accessToken, refreshToken }` | Sets refresh cookie      |
| POST   | `/auth/refresh`         | Public | `{ refreshToken }` (or cookie)      | `{ accessToken, refreshToken }`       | Token rotation           |
| POST   | `/auth/logout`          | JWT    | —                                   | `{ success: true }`                   | Revokes refresh family   |
| POST   | `/auth/forgot-password` | Public | `{ email }`                         | `{ sent: true }`                      | Sends OTP                |
| POST   | `/auth/reset-password`  | Public | `{ email, code, newPassword }`      | `{ success: true }`                   |                          |
| POST   | `/auth/verify-email`    | JWT    | `{ code }`                          | `{ verified: true }`                  |                          |
| POST   | `/auth/verify-phone`    | JWT    | `{ phone, code }`                   | `{ verified: true }`                  | WhatsApp-first OTP       |
| POST   | `/auth/send-phone-otp`  | JWT    | `{ phone }`                         | `{ sent: true, channel: 'whatsapp'    | 'sms' }`                 |     |
| POST   | `/auth/enable-2fa`      | JWT    | `{ phone }`                         | `{ secret, qrCode }`                  |                          |
| POST   | `/auth/verify-2fa`      | JWT    | `{ code }`                          | `{ enabled: true }`                   |                          |
| GET    | `/auth/me`              | JWT    | —                                   | `User`                                | Current user             |
| GET    | `/auth/google`          | Public | —                                   | Redirect                              | Google OAuth initiate    |
| GET    | `/auth/google/callback` | Public | —                                   | Redirect with relay token             | Sets boldmind_sso cookie |

---

### 4.2 SSO

**Module:** `src/modules/auth/sso/` **Controller:** `sso.controller.ts`

| Method | Path            | Auth   | Body / Query          | Returns                               | Notes                                               |
| ------ | --------------- | ------ | --------------------- | ------------------------------------- | --------------------------------------------------- |
| POST   | `/sso/relay`    | JWT    | `{ targetDomain }`    | `{ relayToken, expiresIn: 60 }`       | Creates 64-hex one-time token in REDIS_SESSION      |
| GET    | `/sso/exchange` | Public | `?token=<relayToken>` | `{ accessToken, refreshToken, user }` | Exchanges relay token (one-time, deleted after use) |
| GET    | `/sso/validate` | JWT    | —                     | `{ valid: true, user }`               | Cross-domain session check                          |

**Redis key pattern:** `sso:relay:{64-hex}` → TTL 60 seconds on REDIS_SESSION

---

### 4.3 User / Me

**Module:** `src/modules/user/`

**user.controller.ts** (admin-level user management):

| Method | Path                       | Auth  | Body / Query                                  | Returns                   |
| ------ | -------------------------- | ----- | --------------------------------------------- | ------------------------- |
| GET    | `/users`                   | Admin | `?page, pageSize, role, isActive, search`     | Paginated `User[]`        |
| GET    | `/users/:id`               | Admin | —                                             | `User`                    |
| PATCH  | `/users/:id`               | Admin | `{ role?, isActive?, isBanned?, banReason? }` | `User`                    |
| DELETE | `/users/:id`               | Admin | —                                             | `{ deleted: true }`       |
| GET    | `/users/:id/subscriptions` | Admin | —                                             | `Subscription[]`          |
| GET    | `/users/:id/activity`      | Admin | `?page, pageSize`                             | Paginated `ActivityLog[]` |

**user-me.controller.ts** (self-service):

| Method | Path                               | Auth | Body / Query                                                                                                       | Returns                    |
| ------ | ---------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------ |
| GET    | `/users/me`                        | JWT  | —                                                                                                                  | `User + UserProfile`       |
| PATCH  | `/users/me`                        | JWT  | `{ name?, phone?, ecosystemRole? }`                                                                                | `User`                     |
| GET    | `/users/me/profile`                | JWT  | —                                                                                                                  | `UserProfile`              |
| PATCH  | `/users/me/profile`                | JWT  | `{ displayName?, bio?, location?, state?, prefersPidgin?, dyslexiaMode?, examTarget?, targetYear?, targetScore? }` | `UserProfile`              |
| PATCH  | `/users/me/avatar`                 | JWT  | multipart/form-data `file`                                                                                         | `{ avatarUrl }`            |
| GET    | `/users/me/notifications`          | JWT  | `?page, pageSize, read?`                                                                                           | Paginated `Notification[]` |
| PATCH  | `/users/me/notifications/:id/read` | JWT  | —                                                                                                                  | `{ read: true }`           |
| PATCH  | `/users/me/notifications/read-all` | JWT  | —                                                                                                                  | `{ count: number }`        |
| GET    | `/users/me/activity`               | JWT  | `?page, pageSize, productSlug?`                                                                                    | Paginated `ActivityLog[]`  |
| DELETE | `/users/me`                        | JWT  | `{ confirmEmail }`                                                                                                 | `{ scheduled: true }`      | NDPA erasure queue |

---

### 4.4 Hub

**Module:** `src/modules/hub/` **Controller:** `hub.controller.ts`

| Method | Path                         | Auth   | Body / Query       | Returns                                                             |
| ------ | ---------------------------- | ------ | ------------------ | ------------------------------------------------------------------- |
| GET    | `/hub/dashboard`             | JWT    | —                  | `{ subscriptions, recentActivity, productAccess[], walletBalance }` |
| GET    | `/hub/products`              | JWT    | —                  | `ProductCard[]` — products user has access to                       |
| GET    | `/hub/ecosystem`             | Public | —                  | Full ecosystem map from `BOLDMIND_PRODUCTS`                         |
| POST   | `/hub/referral/generate`     | JWT    | —                  | `{ referralCode, link }`                                            |
| GET    | `/hub/referral/stats`        | JWT    | —                  | `{ totalReferred, totalConverted, totalEarnedKobo }`                |
| GET    | `/hub/waitlist/:productSlug` | Public | —                  | `{ position, total, status }`                                       |
| POST   | `/hub/waitlist/:productSlug` | Public | `{ email, name? }` | `{ joined: true, position }`                                        |
| GET    | `/hub/changelog`             | Public | `?page, pageSize`  | Paginated changelog entries                                         |
| GET    | `/hub/status`                | Public | —                  | System uptime + incidents                                           |

---

### 4.5 Payment & Subscription

**Module:** `src/modules/payment/`

**payment.controller.ts:**

| Method | Path                         | Auth   | Body / Query                                            | Returns                           | Notes                |
| ------ | ---------------------------- | ------ | ------------------------------------------------------- | --------------------------------- | -------------------- |
| POST   | `/payment/initiate`          | JWT    | `{ productSlug, planName, interval, amountNGN, email }` | `{ authorizationUrl, reference }` | Paystack initialize  |
| GET    | `/payment/verify/:reference` | JWT    | —                                                       | `Payment`                         | Manual verify        |
| POST   | `/payment/webhook`           | Public | Paystack webhook body                                   | `{ received: true }`              | HMAC-SHA512 verified |
| GET    | `/payment/history`           | JWT    | `?page, pageSize, productSlug?`                         | Paginated `Payment[]`             |                      |
| GET    | `/payment/:id/invoice`       | JWT    | —                                                       | PDF download                      |                      |

**subscription.service.ts** (used internally + exposed via):

| Method | Path                                 | Auth | Body / Query    | Returns          |
| ------ | ------------------------------------ | ---- | --------------- | ---------------- |
| GET    | `/subscriptions`                     | JWT  | `?productSlug?` | `Subscription[]` |
| GET    | `/subscriptions/:productSlug`        | JWT  | —               | `Subscription`   |
| POST   | `/subscriptions/:productSlug/cancel` | JWT  | `{ reason? }`   | `Subscription`   |
| POST   | `/subscriptions/:productSlug/resume` | JWT  | —               | `Subscription`   |

---

### 4.6 Wallet ⚡ MISSING

**Module to create:** `src/modules/wallet/`

| Method | Path                     | Auth | Body / Query          | Returns                                         | Notes                    |
| ------ | ------------------------ | ---- | --------------------- | ----------------------------------------------- | ------------------------ |
| GET    | `/wallet`                | JWT  | —                     | `{ balanceKobo, balanceNaira, tier, isLocked }` |                          |
| GET    | `/wallet/ledger`         | JWT  | `?page=1&pageSize=20` | Paginated `WalletLedger[]`                      |                          |
| POST   | `/wallet/upgrade`        | JWT  | `{ bvnHash }`         | `{ tier: 'TIER2' }`                             | BVN must be pre-verified |
| POST   | `/wallet/topup/initiate` | JWT  | `{ amountNGN }`       | `{ authorizationUrl, reference }`               | Paystack init            |

**Internal-only methods (not HTTP routes — called from other services):**

```typescript
wallet.credit({ userId, amountKobo, source, description, reference? })
wallet.debit({ userId, amountKobo, source, description, reference? })
```

**Prisma model chain:**
`Wallet` → `WalletLedger` (immutable audit trail, never updated)

**Daily cap enforcement:**

- TIER1: ₦50,000/day (5,000,000 kobo)
- TIER2 (BVN verified): ₦5,000,000/day (500,000,000 kobo)

**Trigger points where `wallet.credit()` is called:**

- `payment.service.ts` → `charge.success` webhook with `productSlug=wallet-topup`
- `user.service.ts` → referral conversion (commission credit)
- `admin.service.ts` → manual credit for promotions
- `marketplace.service.ts` → seller payout after order delivery confirmed

---

### 4.7 Media

**Module:** `src/modules/media/`

| Method | Path                     | Auth | Body / Query                                  | Returns                        |
| ------ | ------------------------ | ---- | --------------------------------------------- | ------------------------------ |
| POST   | `/media/upload`          | JWT  | multipart/form-data `file, folder, isPublic?` | `Media` (with `url`, `cdnUrl`) |
| GET    | `/media`                 | JWT  | `?folder?, page, pageSize`                    | Paginated `Media[]`            |
| DELETE | `/media/:id`             | JWT  | —                                             | `{ deleted: true }`            |
| GET    | `/media/:key/signed-url` | JWT  | `?expiresIn=3600`                             | `{ url }`                      |

---

### 4.8 Notification

**Module:** `src/modules/notification/`

| Method | Path                              | Auth           | Body / Query                         | Returns                            | Notes                     |
| ------ | --------------------------------- | -------------- | ------------------------------------ | ---------------------------------- | ------------------------- | ---------- | -------------- |
| POST   | `/notifications/email`            | Admin/Internal | `{ to, subject, body, templateId? }` | `{ queued: true }`                 |                           |
| POST   | `/notifications/push`             | Admin/Internal | `{ userId, title, body, meta? }`     | `{ queued: true }`                 |                           |
| POST   | `/notifications/whatsapp`         | Admin/Internal | `{ to, message, templateName? }`     | `{ sent: true, channel }`          |                           |
| POST   | `/notifications/otp`              | Internal       | `{ to, code, purpose, name? }`       | `{ sent: true, channel: 'whatsapp' | 'sms'                     | 'email' }` | WhatsApp-first |
| GET    | `/notifications/push/vapid-key`   | Public         | —                                    | `{ publicKey }`                    | For PWA push subscription |
| POST   | `/notifications/push/subscribe`   | JWT            | `{ endpoint, keys }`                 | `PushSubscription`                 |                           |
| DELETE | `/notifications/push/unsubscribe` | JWT            | `{ endpoint }`                       | `{ deleted: true }`                |                           |

**OTP delivery order (notification.service.ts):**

1. WhatsApp Business API (`@boldmindng/sms` WhatsAppProvider) — Nigerian numbers
2. Termii SMS fallback (`@boldmindng/sms` TermiiProvider)
3. Email fallback — `email_verify` purpose only

---

### 4.9 Analytics

**Module:** `src/modules/analytics/`

| Method | Path                       | Auth       | Body / Query                                   | Returns                                 |
| ------ | -------------------------- | ---------- | ---------------------------------------------- | --------------------------------------- |
| POST   | `/analytics/track`         | Public/JWT | `{ event, properties?, page?, sessionId? }`    | `{ tracked: true }`                     |
| GET    | `/analytics/events`        | Admin      | `?userId?, event?, page, pageSize, from?, to?` | Paginated `AnalyticsEvent[]`            |
| GET    | `/analytics/dashboard`     | Admin      | `?from, to, productSlug?`                      | `{ dau, mau, topEvents[], topPages[] }` |
| GET    | `/analytics/product/:slug` | Admin      | `?from, to`                                    | Product-specific metrics                |

---

### 4.10 AI

**Module:** `src/modules/ai/` **Controller:** `ai.controller.ts`

| Method | Path                      | Auth | Body / Query                                                            | Returns                              | Notes                                          |
| ------ | ------------------------- | ---- | ----------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| POST   | `/ai/generate`            | JWT  | `{ provider, prompt, systemPrompt?, maxTokens?, temperature?, model? }` | `{ content, tokensUsed, latencyMs }` | Provider: openai/gemini/groq/cloudflare/ollama |
| POST   | `/ai/generate/image`      | JWT  | `{ prompt, aspectRatio?, model? }`                                      | `{ jobId }` → poll                   | fal.ai FLUX                                    |
| GET    | `/ai/jobs/:jobId`         | JWT  | —                                                                       | `PlanAIJob` with status              |
| POST   | `/ai/social/caption`      | JWT  | `{ topic, platform, tone?, pidginMode? }`                               | `{ caption, hashtags[] }`            |                                                |
| POST   | `/ai/social/video-script` | JWT  | `{ topic, duration, platform }`                                         | `{ script, hook, cta }`              |                                                |
| GET    | `/ai/trends`              | JWT  | —                                                                       | `{ trends[], updatedAt }`            | Cached REDIS_CACHE 2h                          |
| POST   | `/ai/image-edit`          | JWT  | multipart `{ image, prompt }`                                           | `{ jobId }`                          |                                                |
| GET    | `/ai/generated-content`   | JWT  | `?type?, page, pageSize`                                                | Paginated `GeneratedContent[]`       |                                                |

---

### 4.11 Automation

**Module:** `src/modules/automation/`

| Method | Path                                    | Auth     | Body / Query                                        | Returns                              | Notes                  |
| ------ | --------------------------------------- | -------- | --------------------------------------------------- | ------------------------------------ | ---------------------- |
| POST   | `/automation/social/schedule`           | JWT      | `{ platforms[], content, scheduledAt, mediaUrls? }` | `{ jobId }`                          | Queues social-post job |
| GET    | `/automation/social/calendar`           | JWT      | `?from, to`                                         | `ScheduledPost[]`                    |                        |
| DELETE | `/automation/social/calendar/:jobId`    | JWT      | —                                                   | `{ cancelled: true }`                |                        |
| POST   | `/automation/email/campaign`            | JWT      | `{ name, segmentId, templateId, scheduledAt? }`     | `{ campaignId }`                     |                        |
| GET    | `/automation/email/campaigns`           | JWT      | `?page, pageSize`                                   | Paginated campaigns                  |                        |
| GET    | `/automation/email/campaigns/:id/stats` | JWT      | —                                                   | `{ sent, opened, clicked, bounced }` |                        |
| POST   | `/automation/n8n/trigger`               | Internal | `{ workflowId, payload }`                           | `{ executed: true }`                 |                        |
| GET    | `/automation/n8n/logs`                  | Admin    | `?page, pageSize`                                   | Paginated n8n logs                   |                        |

---

### 4.12 Amebogist

**Module:** `src/modules/amebogist/`

**Public endpoints (no auth):**

| Method | Path                     | Auth   | Body / Query                                                       | Returns                       |
| ------ | ------------------------ | ------ | ------------------------------------------------------------------ | ----------------------------- |
| GET    | `/amebogist/posts`       | Public | `?page, pageSize, category?, status=published, featured?, search?` | Paginated `Post[]`            |
| GET    | `/amebogist/posts/:slug` | Public | —                                                                  | `Post` (increments views)     |
| GET    | `/amebogist/categories`  | Public | —                                                                  | `string[]`                    |
| GET    | `/amebogist/trending`    | Public | `?limit=10`                                                        | `Post[]` sorted by views/time |
| GET    | `/amebogist/rss`         | Public | —                                                                  | RSS XML feed                  |
| GET    | `/amebogist/sitemap`     | Public | —                                                                  | XML sitemap                   |

**Authenticated user endpoints:**

| Method | Path                            | Auth            | Body / Query                        | Returns                                           |
| ------ | ------------------------------- | --------------- | ----------------------------------- | ------------------------------------------------- | ------- | ---------- | -------------- | ---------- | ----------------------- |
| POST   | `/amebogist/posts/:id/react`    | JWT             | `{ type: 'like'                     | 'love'                                            | 'laugh' | 'fire'     | 'sad'          | 'angry' }` | Updated reaction counts |
| POST   | `/amebogist/posts/:id/comments` | JWT             | `{ content, parentId?, language? }` | `Comment`                                         |
| GET    | `/amebogist/posts/:id/comments` | Public          | `?page, pageSize`                   | Paginated `Comment[]` (top-level, replies nested) |
| POST   | `/amebogist/comments/:id/react` | JWT             | `{ type: 'like'                     | 'love'                                            | 'laugh' | 'angry' }` | Updated counts |
| PATCH  | `/amebogist/comments/:id`       | JWT (own)       | `{ content }`                       | `Comment`                                         |
| DELETE | `/amebogist/comments/:id`       | JWT (own/admin) | —                                   | `{ deleted: true }`                               |

**Creator/Author endpoints:**

| Method | Path                           | Auth          | Body / Query                                                         | Returns                   |
| ------ | ------------------------------ | ------------- | -------------------------------------------------------------------- | ------------------------- |
| POST   | `/amebogist/posts`             | Creator/Admin | `{ title, content, excerpt, category, tags, media?, scheduledFor? }` | `Post` (draft)            |
| PATCH  | `/amebogist/posts/:id`         | Creator/Admin | Partial `Post` fields                                                | `Post`                    |
| POST   | `/amebogist/posts/:id/publish` | Creator/Admin | —                                                                    | `Post` (status=published) |
| DELETE | `/amebogist/posts/:id`         | Creator/Admin | —                                                                    | `{ archived: true }`      |
| GET    | `/amebogist/creator/stats`     | Creator       | —                                                                    | `CreatorStats`            |
| GET    | `/amebogist/creator/posts`     | Creator       | `?status?, page, pageSize`                                           | Own posts paginated       |

**Response schema: Post (abridged):**

```json
{
  "_id": "...",
  "slug": "how-to-start-business-naija-2026",
  "title": "How to Start Business for Nigeria 2026",
  "content": { "pidgin": "...", "english": "..." },
  "excerpt": "...",
  "category": "ai-tech",
  "tags": ["business", "nigeria"],
  "author": { "id": "...", "name": "Charl", "isVerified": true },
  "media": { "featuredImage": "https://...", "gallery": [] },
  "engagement": {
    "views": 1200,
    "likes": 89,
    "shares": 23,
    "commentsCount": 12
  },
  "status": "published",
  "publishedAt": "2026-06-14T08:30:00.000Z"
}
```

---

### 4.13 EduCenter

**Module:** `src/modules/educenter/`

**Study / CBT (existing):**

| Method | Path                               | Auth | Body / Query                                                  | Returns                                      | Notes                                     |
| ------ | ---------------------------------- | ---- | ------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| GET    | `/educenter/subjects`              | JWT  | `?examType?`                                                  | `string[]`                                   |                                           |
| POST   | `/educenter/sessions`              | JWT  | `{ examType, subject, totalQuestions, timeLimitSecs, year? }` | `CBTSession`                                 | Fetches from ALOC → caches in REDIS_CACHE |
| GET    | `/educenter/sessions/:id`          | JWT  | —                                                             | `CBTSession + answers[]`                     |                                           |
| POST   | `/educenter/sessions/:id/answer`   | JWT  | `{ alocQuestionId, selectedAnswer }`                          | `{ isCorrect, correctAnswer, explanation? }` |                                           |
| POST   | `/educenter/sessions/:id/complete` | JWT  | —                                                             | `{ score, percentage, timeTaken }`           | Updates StudyStreak + SubjectPerformance  |
| GET    | `/educenter/sessions`              | JWT  | `?page, pageSize, examType?, subject?`                        | Paginated `CBTSession[]`                     |                                           |
| GET    | `/educenter/progress`              | JWT  | `?examType?, subject?`                                        | `SubjectPerformance[]`                       |                                           |
| GET    | `/educenter/streak`                | JWT  | —                                                             | `StudyStreak`                                |                                           |
| GET    | `/educenter/leaderboard`           | JWT  | `?examType?, subject?, limit=50`                              | Ranked `StudyStreak[]`                       |                                           |
| GET    | `/educenter/questions/random`      | JWT  | `?examType, subject, count=10, year?`                         | `Question[]`                                 | From ALOC API                             |

**Courses (existing, partially):**

| Method | Path                                  | Auth       | Body / Query                             | Returns                               |
| ------ | ------------------------------------- | ---------- | ---------------------------------------- | ------------------------------------- |
| GET    | `/educenter/courses`                  | Public/JWT | `?category?, page, pageSize, isPremium?` | Paginated `Course[]` (first 6 public) |
| GET    | `/educenter/courses/:slug`            | Public/JWT | —                                        | `Course + lessons[]`                  |
| POST   | `/educenter/courses/:slug/enroll`     | JWT        | —                                        | `CourseEnrollment`                    |
| PATCH  | `/educenter/enrollments/:id/progress` | JWT        | `{ progressPercent, lastLessonId }`      | `CourseEnrollment`                    |
| GET    | `/educenter/enrollments`              | JWT        | —                                        | `CourseEnrollment[]`                  |

**Prompts (to build Wave 3):**

| Method | Path                           | Auth       | Body / Query                            | Returns                             | Notes                 |
| ------ | ------------------------------ | ---------- | --------------------------------------- | ----------------------------------- | --------------------- |
| GET    | `/educenter/prompts`           | Public/JWT | `?category?, page, pageSize`            | Paginated (6 public, all with auth) |                       |
| GET    | `/educenter/prompts/:slug`     | Public/JWT | —                                       | `PromptTemplate`                    |                       |
| POST   | `/educenter/prompts/:slug/use` | JWT        | `{ variables: Record<string, string> }` | `{ filledTemplate }`                | Increments usageCount |

**Playbooks (to build Wave 3):**

| Method | Path                                  | Auth       | Body / Query                 | Returns                                   |
| ------ | ------------------------------------- | ---------- | ---------------------------- | ----------------------------------------- |
| GET    | `/educenter/playbooks`                | Public/JWT | `?category?, page, pageSize` | Paginated (6 public slugs, all with auth) |
| GET    | `/educenter/playbooks/:slug`          | Public/JWT | —                            | `Playbook`                                |
| GET    | `/educenter/playbooks/:slug/download` | JWT (Pro)  | —                            | PDF binary                                |

**LMS Builder ⚡ MISSING (Wave 3) — `src/modules/educenter/lms/`:**

| Method | Path                                  | Auth    | Body / Query                                                        | Returns                        |
| ------ | ------------------------------------- | ------- | ------------------------------------------------------------------- | ------------------------------ |
| POST   | `/educenter/lms/courses`              | Creator | `{ title, description, category, price?, isPremium }`               | `Course` (draft)               |
| GET    | `/educenter/lms/courses`              | Creator | `?page, pageSize`                                                   | Own courses                    |
| GET    | `/educenter/lms/courses/:id`          | Creator | —                                                                   | `Course + lessons[]`           |
| PATCH  | `/educenter/lms/courses/:id`          | Creator | Partial course fields                                               | `Course`                       |
| POST   | `/educenter/lms/courses/:id/publish`  | Creator | —                                                                   | `Course` (status=published)    |
| POST   | `/educenter/lms/courses/:id/lessons`  | Creator | `{ title, content?, videoUrl?, durationMins, isFree }`              | `CourseLesson`                 |
| PATCH  | `/educenter/lms/lessons/:id`          | Creator | Partial lesson                                                      | `CourseLesson`                 |
| DELETE | `/educenter/lms/lessons/:id`          | Creator | —                                                                   | `{ deleted: true }`            |
| GET    | `/educenter/lms/courses/:id/students` | Creator | `?page, pageSize`                                                   | Paginated `CourseEnrollment[]` |
| GET    | `/educenter/lms/courses/:id/earnings` | Creator | `?from?, to?`                                                       | `{ totalKobo, byMonth[] }`     |
| POST   | `/educenter/lms/generate`             | Creator | `{ topic, targetAudience, level, numberOfModules, includeQuizzes }` | `{ jobId }` — poll             |

**School Management Portal ⚡ MISSING (Wave 3) — `src/modules/educenter/school/`:**

| Method | Path                                | Auth        | Body / Query                                                | Returns                            |
| ------ | ----------------------------------- | ----------- | ----------------------------------------------------------- | ---------------------------------- |
| POST   | `/educenter/schools/register`       | JWT         | `{ name, state, contactEmail }`                             | `School`                           |
| GET    | `/educenter/schools/me`             | SchoolAdmin | —                                                           | `School + stats`                   |
| POST   | `/educenter/schools/me/students`    | SchoolAdmin | `{ students: [{email, name}] }` or CSV                      | `{ enrolled: number, errors: [] }` |
| GET    | `/educenter/schools/me/students`    | SchoolAdmin | `?page, pageSize, search?`                                  | Paginated students                 |
| GET    | `/educenter/schools/me/performance` | SchoolAdmin | `?examType?, subject?`                                      | Class-level `SubjectPerformance[]` |
| POST   | `/educenter/schools/me/assignments` | SchoolAdmin | `{ classGroup, examType, subject, dueDate, questionCount }` | `Assignment`                       |

**Vibe Coders Classroom additions ⚡ MISSING (Wave 3) — extends `vibecoders.controller.ts`:**

| Method | Path                                                    | Auth         | Body / Query                                | Returns                           |
| ------ | ------------------------------------------------------- | ------------ | ------------------------------------------- | --------------------------------- |
| GET    | `/villagecircle/vibecoders/portal/curriculum`           | Enrolled     | —                                           | Curriculum with progress overlay  |
| GET    | `/villagecircle/vibecoders/portal/curriculum/:moduleId` | Enrolled     | —                                           | Module detail + completion status |
| POST   | `/villagecircle/vibecoders/portal/projects`             | Enrolled     | `{ moduleId, githubUrl?, loomUrl?, brief }` | `VibeCoderProjectSubmission`      |
| GET    | `/villagecircle/vibecoders/portal/projects`             | Enrolled     | —                                           | Own submissions                   |
| PATCH  | `/villagecircle/vibecoders/portal/projects/:id`         | Mentor/Admin | `{ status, mentorNote?, score? }`           | Updated submission                |
| POST   | `/villagecircle/vibecoders/portal/attendance`           | Enrolled     | `{ sessionDate, moduleId, sessionType }`    | `VibeCoderAttendance`             |
| GET    | `/villagecircle/vibecoders/portal/mentors`              | Enrolled     | —                                           | Mentor directory                  |

---

### 4.14 PlanAI Suite

**Module:** `src/modules/planai/`
All PlanAI routes require JWT + active subscription to the relevant product (or `planai` suite).

**Suite Shell:**

| Method | Path                      | Auth | Body / Query                      | Returns                                                                     |
| ------ | ------------------------- | ---- | --------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/planai`                 | JWT  | —                                 | Suite dashboard: access map, usage, recent jobs                             |
| GET    | `/planai/tools`           | JWT  | —                                 | `ProductCard[]` — user's accessible tools                                   |
| GET    | `/planai/jobs`            | JWT  | `?type?, status?, page, pageSize` | Paginated `PlanAIJob[]`                                                     |
| GET    | `/planai/jobs/:id`        | JWT  | —                                 | `PlanAIJob`                                                                 |
| POST   | `/planai/jobs/:id/cancel` | JWT  | —                                 | `PlanAIJob` (status=CANCELLED)                                              |
| GET    | `/planai/usage`           | JWT  | `?productSlug?, from?, to?`       | `UsageRecord[]`                                                             |
| GET    | `/planai/score`           | JWT  | —                                 | `{ score, breakdown: { social, brand, intelligence, operations, growth } }` |

---

**PLANAI 01 — Social Media Manager** (`/planai/social/*`)

| Method | Path                                | Auth | Body                                                   | Returns                                             |
| ------ | ----------------------------------- | ---- | ------------------------------------------------------ | --------------------------------------------------- |
| POST   | `/planai/social/caption`            | JWT  | `{ topic, platform, brandVoice?, pidginMode?, tone? }` | `{ caption, hashtags[], charCount }`                |
| POST   | `/planai/social/video-script`       | JWT  | `{ topic, duration, platform, hookStyle? }`            | `{ hook, body, cta, onScreenText }`                 |
| POST   | `/planai/social/repurpose`          | JWT  | `{ sourceContent, targetPlatforms[] }`                 | `{ posts: [{platform, content}] }`                  |
| POST   | `/planai/social/bulk-create`        | JWT  | `{ topics[], platform, count }`                        | `{ jobId }` — async batch                           |
| POST   | `/planai/social/schedule`           | JWT  | `{ platforms[], content, mediaUrls?, scheduledAt }`    | `{ jobId }`                                         |
| GET    | `/planai/social/calendar`           | JWT  | `?from, to`                                            | `ScheduledPost[]`                                   |
| DELETE | `/planai/social/calendar/:jobId`    | JWT  | —                                                      | `{ cancelled: true }`                               |
| GET    | `/planai/social/analytics`          | JWT  | `?platform?, from, to`                                 | `{ impressions, reach, engagement, topPosts[] }`    |
| POST   | `/planai/social/competitor-analyze` | JWT  | `{ handle, platform }`                                 | `{ postingFrequency, topTopics[], estimatedReach }` |
| GET    | `/planai/social/trending`           | JWT  | —                                                      | Nigerian trending topics (cached 2h)                |
| POST   | `/planai/social/hashtags`           | JWT  | `{ topic, platform }`                                  | `{ hashtags[], volume[] }`                          |

**WhatsApp / DM Automation:**

| Method | Path                                        | Auth   | Body                                  | Returns                              |
| ------ | ------------------------------------------- | ------ | ------------------------------------- | ------------------------------------ | ------------------------------ |
| GET    | `/planai/social/conversations`              | JWT    | `?platform?, status?, page, pageSize` | Paginated `ConversationLog[]`        |
| GET    | `/planai/social/conversations/:id`          | JWT    | —                                     | `ConversationLog + messages`         |
| POST   | `/planai/social/conversations/:id/reply`    | JWT    | `{ message }`                         | `{ sent: true }`                     |
| POST   | `/planai/social/conversations/:id/escalate` | JWT    | —                                     | `ConversationLog (status=ESCALATED)` |
| GET    | `/planai/social/leads`                      | JWT    | `?isQualified?, page, pageSize`       | Paginated `LeadCapture[]`            |
| POST   | `/planai/social/broadcast`                  | JWT    | `{ message, segment?, scheduledAt? }` | `{ jobId }`                          |
| POST   | `/planai/social/meta/webhook`               | Public | Meta webhook body                     | `{ received: true }`                 | Verified via META_VERIFY_TOKEN |
| GET    | `/planai/social/meta/webhook`               | Public | `?hub.verify_token, hub.challenge`    | Challenge echo                       | Webhook verification           |

---

**PLANAI 02 — Ads Center** (`/planai/ads/*`)

| Method | Path                               | Auth | Body                                                                   | Returns                                             |
| ------ | ---------------------------------- | ---- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| POST   | `/planai/ads/campaigns`            | JWT  | `{ platform, objective, audience, budget, creatives[], scheduledAt? }` | `{ jobId, campaignId? }`                            |
| GET    | `/planai/ads/campaigns`            | JWT  | `?platform?, status?, page, pageSize`                                  | Paginated campaigns                                 |
| GET    | `/planai/ads/campaigns/:id`        | JWT  | —                                                                      | Campaign + stats                                    |
| POST   | `/planai/ads/campaigns/:id/pause`  | JWT  | —                                                                      | `{ paused: true }`                                  |
| POST   | `/planai/ads/campaigns/:id/resume` | JWT  | —                                                                      | `{ resumed: true }`                                 |
| POST   | `/planai/ads/creatives/generate`   | JWT  | `{ topic, platform, format, brandContext? }`                           | `{ headline, body, cta, imagePrompt }`              |
| POST   | `/planai/ads/audience/lookalike`   | JWT  | `{ platform, sourceListUrl }`                                          | `{ audienceId }`                                    |
| GET    | `/planai/ads/performance`          | JWT  | `?from, to, platform?`                                                 | `{ spend, impressions, clicks, conversions, roas }` |

---

**PLANAI 03 — Brand & Digital Home** (`/planai/brand/*`)

| Method | Path                                    | Auth   | Body                                                                       | Returns                                       |
| ------ | --------------------------------------- | ------ | -------------------------------------------------------------------------- | --------------------------------------------- | -------------- | ------- |
| POST   | `/planai/brand/logo/generate`           | JWT    | `{ businessName, industry, style?, colors? }`                              | `{ jobId }` — async                           |
| GET    | `/planai/brand/logo/results/:jobId`     | JWT    | —                                                                          | `{ imageUrls[], selectedUrl? }`               |
| POST   | `/planai/brand/kit/generate`            | JWT    | `{ logoUrl, businessName, primaryColor }`                                  | `{ jobId }`                                   |
| GET    | `/planai/brand/kit/:id`                 | JWT    | —                                                                          | `{ logoUrl, palette, typography, socialKit }` |
| POST   | `/planai/brand/portfolio`               | JWT    | `{ displayName, bio, skills[], works[] }`                                  | `Portfolio`                                   |
| GET    | `/planai/brand/portfolio`               | JWT    | —                                                                          | `Portfolio`                                   |
| PATCH  | `/planai/brand/portfolio`               | JWT    | Partial portfolio                                                          | `Portfolio`                                   |
| GET    | `/planai/brand/portfolio/:username`     | Public | —                                                                          | Public portfolio view                         |
| POST   | `/planai/brand/store`                   | JWT    | `{ name, description, category, colorTheme }`                              | `Store`                                       |
| GET    | `/planai/brand/store`                   | JWT    | —                                                                          | `Store + stats`                               |
| PATCH  | `/planai/brand/store`                   | JWT    | Partial store                                                              | `Store`                                       |
| POST   | `/planai/brand/store/products`          | JWT    | `{ name, price, description, imageUrls[], stock }`                         | `Product`                                     |
| GET    | `/planai/brand/store/products`          | JWT    | `?page, pageSize, isActive?`                                               | Paginated `Product[]`                         |
| PATCH  | `/planai/brand/store/products/:id`      | JWT    | Partial product                                                            | `Product`                                     |
| DELETE | `/planai/brand/store/products/:id`      | JWT    | —                                                                          | `{ deleted: true }`                           |
| GET    | `/planai/brand/store/orders`            | JWT    | `?status?, page, pageSize`                                                 | Paginated `Order[]`                           |
| PATCH  | `/planai/brand/store/orders/:id/status` | JWT    | `{ status: 'CONFIRMED'                                                     | 'SHIPPED'                                     | 'DELIVERED' }` | `Order` |
| GET    | `/planai/brand/store/:slug`             | Public | —                                                                          | Public store with products                    |
| POST   | `/planai/brand/store/:slug/checkout`    | Public | `{ items[], customerName, customerEmail, customerPhone, deliveryAddress }` | `{ orderId, paymentUrl }`                     |

---

**PLANAI 04 — Business Intelligence Suite** (`/planai/intelligence/*`)

| Method | Path                                               | Auth | Body                                                                        | Returns                                                     |
| ------ | -------------------------------------------------- | ---- | --------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------- | --------------------- | --------------------- |
| POST   | `/planai/intelligence/business-plan`               | JWT  | `{ businessName, industry, targetMarket, problem, solution, revenueModel }` | `{ jobId }`                                                 |
| GET    | `/planai/intelligence/business-plan/:jobId`        | JWT  | —                                                                           | `PlanAIJob` with output                                     |
| GET    | `/planai/intelligence/business-plan/:jobId/export` | JWT  | `?format=pdf                                                                | docx`                                                       | File binary |
| POST   | `/planai/intelligence/forecast`                    | JWT  | `{ businessName, monthlyRevenue, expenses, growthRate, months }`            | `{ projections[], breakEven, burnRate }`                    |
| POST   | `/planai/intelligence/swot`                        | JWT  | `{ businessName, industry, description }`                                   | `{ strengths[], weaknesses[], opportunities[], threats[] }` |
| GET    | `/planai/intelligence/analytics`                   | JWT  | `?from, to`                                                                 | `{ revenue, users, topChannels[], funnel }`                 |
| POST   | `/planai/intelligence/analytics/connect`           | JWT  | `{ provider: 'paystack'                                                     | 'meta'                                                      | 'tiktok'    | 'ga4', credentials }` | `{ connected: true }` |
| GET    | `/planai/intelligence/market`                      | JWT  | `?industry, state?`                                                         | `{ marketSize, competitors[], trends[] }`                   |

---

**PLANAI 05 — Investor Readiness Suite** (`/planai/investor/*`)

| Method | Path                                        | Auth | Body                                                             | Returns                      |
| ------ | ------------------------------------------- | ---- | ---------------------------------------------------------------- | ---------------------------- | ----------- |
| POST   | `/planai/investor/pitch-deck`               | JWT  | `{ businessName, stage, industry, ask, useOfFunds }`             | `{ jobId }`                  |
| GET    | `/planai/investor/pitch-deck/:jobId`        | JWT  | —                                                                | `PlanAIJob` with slides JSON |
| GET    | `/planai/investor/pitch-deck/:jobId/export` | JWT  | `?format=pdf                                                     | pptx`                        | File binary |
| POST   | `/planai/investor/safe`                     | JWT  | `{ companyName, investorName, investmentAmount, valuationCap? }` | `{ document, docUrl }`       |
| POST   | `/planai/investor/data-room`                | JWT  | `{ name, documents[] }`                                          | `DataRoom`                   |
| GET    | `/planai/investor/data-room`                | JWT  | —                                                                | `DataRoom[]`                 |
| POST   | `/planai/investor/data-room/:id/share`      | JWT  | `{ email, expiresAt? }`                                          | `{ shareUrl, accessToken }`  |
| GET    | `/planai/investor/cap-table`                | JWT  | —                                                                | `CapTable`                   |
| PATCH  | `/planai/investor/cap-table`                | JWT  | `{ shareholders[] }`                                             | `CapTable`                   |
| GET    | `/planai/investor/vcs`                      | JWT  | `?stage?, industry?`                                             | Active Nigerian VCs list     |

---

**PLANAI 06 — Marketing Automation** (`/planai/marketing/*`)

| Method | Path                                      | Auth | Body                                                  | Returns                                              |
| ------ | ----------------------------------------- | ---- | ----------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- | ---------- |
| POST   | `/planai/marketing/campaigns`             | JWT  | `{ name, type: 'email'                                | 'whatsapp'                                           | 'sms', segment, content, scheduledAt? }` | `Campaign` |
| GET    | `/planai/marketing/campaigns`             | JWT  | `?page, pageSize, type?`                              | Paginated campaigns                                  |
| GET    | `/planai/marketing/campaigns/:id/stats`   | JWT  | —                                                     | `{ sent, delivered, opened, clicked, unsubscribed }` |
| POST   | `/planai/marketing/campaigns/:id/send`    | JWT  | —                                                     | `{ queued: true, estimatedSend }`                    |
| POST   | `/planai/marketing/segments`              | JWT  | `{ name, filters: { behavior?, location?, spend? } }` | `Segment`                                            |
| GET    | `/planai/marketing/segments`              | JWT  | —                                                     | `Segment[]`                                          |
| GET    | `/planai/marketing/segments/:id/contacts` | JWT  | `?page, pageSize`                                     | Paginated contacts                                   |
| POST   | `/planai/marketing/templates`             | JWT  | `{ name, type, subject?, body }`                      | `Template`                                           |
| GET    | `/planai/marketing/templates`             | JWT  | `?type?`                                              | `Template[]`                                         |
| POST   | `/planai/marketing/ab-test`               | JWT  | `{ campaignId, variantB }`                            | `{ testId }`                                         |
| GET    | `/planai/marketing/ab-test/:id/results`   | JWT  | —                                                     | `{ winner, significance, variantA, variantB }`       |

---

**PLANAI 07 — Business Discovery Directory** (`/planai/directory/*`)

| Method | Path                                      | Auth | Body                                        | Returns                                 |
| ------ | ----------------------------------------- | ---- | ------------------------------------------- | --------------------------------------- | ----------- |
| GET    | `/planai/directory/search`                | JWT  | `?query, category?, state?, page, pageSize` | Paginated business listings             |
| GET    | `/planai/directory/contacts`              | JWT  | `?company?, role?, page, pageSize`          | Paginated contacts                      |
| POST   | `/planai/directory/contacts/enrich`       | JWT  | `{ linkedinUrl }`                           | `{ name, email, phone, company, role }` |
| POST   | `/planai/directory/contacts/verify-email` | JWT  | `{ email }`                                 | `{ valid, deliverable, mxRecord }`      |
| GET    | `/planai/directory/lists`                 | JWT  | —                                           | `ContactList[]`                         |
| POST   | `/planai/directory/lists`                 | JWT  | `{ name }`                                  | `ContactList`                           |
| POST   | `/planai/directory/lists/:id/add`         | JWT  | `{ contactIds[] }`                          | `{ added: number }`                     |
| GET    | `/planai/directory/lists/:id/export`      | JWT  | `?format=csv                                | xlsx`                                   | File binary |
| GET    | `/planai/directory/usage`                 | JWT  | —                                           | `{ used, limit, resetAt }`              |

---

**PLANAI 08 — AI Business Agent** (`/planai/agent/*`)

| Method | Path                      | Auth | Body                                                | Returns                     |
| ------ | ------------------------- | ---- | --------------------------------------------------- | --------------------------- | ------------------ | ------------ |
| POST   | `/planai/agent/configure` | JWT  | `{ businessContext, workflows[], escalationEmail }` | `AgentConfig`               |
| GET    | `/planai/agent/config`    | JWT  | —                                                   | `AgentConfig`               |
| GET    | `/planai/agent/logs`      | JWT  | `?from, to, page, pageSize`                         | Paginated agent action logs |
| POST   | `/planai/agent/task`      | JWT  | `{ type: 'invoice-followup'                         | 'appointment'               | 'inquiry', data }` | `{ taskId }` |
| GET    | `/planai/agent/tasks`     | JWT  | `?status?, page, pageSize`                          | Paginated tasks             |
| POST   | `/planai/agent/pause`     | JWT  | —                                                   | `{ paused: true }`          |
| POST   | `/planai/agent/resume`    | JWT  | —                                                   | `{ active: true }`          |

---

**PLANAI 09 — Project Manager** (`/planai/projects/*`)

| Method | Path                                                | Auth | Body                                                                                              | Returns              |
| ------ | --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------- | -------------------- |
| GET    | `/planai/projects/workspaces`                       | JWT  | —                                                                                                 | `Workspace[]`        |
| POST   | `/planai/projects/workspaces`                       | JWT  | `{ name, description?, color?, icon? }`                                                           | `Workspace`          |
| PATCH  | `/planai/projects/workspaces/:id`                   | JWT  | Partial workspace                                                                                 | `Workspace`          |
| POST   | `/planai/projects/workspaces/:id/members`           | JWT  | `{ email, role }`                                                                                 | `WorkspaceMember`    |
| DELETE | `/planai/projects/workspaces/:id/members/:userId`   | JWT  | —                                                                                                 | `{ removed: true }`  |
| GET    | `/planai/projects/workspaces/:workspaceId/projects` | JWT  | —                                                                                                 | `Project[]`          |
| POST   | `/planai/projects/workspaces/:workspaceId/projects` | JWT  | `{ name, description?, color? }`                                                                  | `Project`            |
| GET    | `/planai/projects/tasks`                            | JWT  | `?workspaceId, projectId?, status?, assigneeId?, page, pageSize`                                  | Paginated `Task[]`   |
| POST   | `/planai/projects/tasks`                            | JWT  | `{ workspaceId, projectId?, title, priority, dueDate?, estimatedMinutes?, tags?, parentTaskId? }` | `Task`               |
| PATCH  | `/planai/projects/tasks/:id`                        | JWT  | Partial task                                                                                      | `Task`               |
| DELETE | `/planai/projects/tasks/:id`                        | JWT  | —                                                                                                 | `{ archived: true }` |
| POST   | `/planai/projects/pomodoro/start`                   | JWT  | `{ taskId?, durationMinutes, type? }`                                                             | `PomodoroSession`    |
| PATCH  | `/planai/projects/pomodoro/:id/complete`            | JWT  | `{ interruptions?, notes? }`                                                                      | `PomodoroSession`    |
| GET    | `/planai/projects/pomodoro/history`                 | JWT  | `?from, to`                                                                                       | `PomodoroSession[]`  |
| GET    | `/planai/projects/knowledge`                        | JWT  | `?tags?, search?`                                                                                 | `KnowledgeNode[]`    |
| POST   | `/planai/projects/knowledge`                        | JWT  | `{ title, content, nodeType, tags?, linkedNodeIds?, sourceUrl? }`                                 | `KnowledgeNode`      |
| PATCH  | `/planai/projects/knowledge/:id`                    | JWT  | Partial node                                                                                      | `KnowledgeNode`      |
| DELETE | `/planai/projects/knowledge/:id`                    | JWT  | —                                                                                                 | `{ archived: true }` |

---

**PLANAI 10 — CRM & Client Management** (`/planai/crm/*`)

| Method | Path                                    | Auth | Body                                                 | Returns                                       |
| ------ | --------------------------------------- | ---- | ---------------------------------------------------- | --------------------------------------------- | ------- | ----------------------------- | ------------- |
| GET    | `/planai/crm/contacts`                  | JWT  | `?status?, segment?, search?, page, pageSize`        | Paginated contacts                            |
| POST   | `/planai/crm/contacts`                  | JWT  | `{ name, email?, phone?, company?, source? }`        | `Contact`                                     |
| GET    | `/planai/crm/contacts/:id`              | JWT  | —                                                    | `Contact + interactions[]`                    |
| PATCH  | `/planai/crm/contacts/:id`              | JWT  | Partial contact                                      | `Contact`                                     |
| DELETE | `/planai/crm/contacts/:id`              | JWT  | —                                                    | `{ deleted: true }`                           |
| GET    | `/planai/crm/pipeline`                  | JWT  | —                                                    | `{ stages: [{ name, deals[], totalValue }] }` |
| POST   | `/planai/crm/deals`                     | JWT  | `{ contactId, title, value, stage, expectedClose? }` | `Deal`                                        |
| PATCH  | `/planai/crm/deals/:id`                 | JWT  | `{ stage?, value?, notes? }`                         | `Deal`                                        |
| POST   | `/planai/crm/interactions`              | JWT  | `{ contactId, type: 'call'                           | 'whatsapp'                                    | 'email' | 'meeting', notes, outcome? }` | `Interaction` |
| GET    | `/planai/crm/contacts/:id/interactions` | JWT  | `?page, pageSize`                                    | Paginated `Interaction[]`                     |
| GET    | `/planai/crm/reminders/today`           | JWT  | —                                                    | `Contact[]` needing follow-up                 |
| POST   | `/planai/crm/ai/next-action`            | JWT  | `{ contactId }`                                      | `{ recommendation, reason }`                  |

---

**PLANAI 11 — HR & Payroll** (`/planai/hr/*`)

| Method | Path                                             | Auth | Body                                                       | Returns                               |
| ------ | ------------------------------------------------ | ---- | ---------------------------------------------------------- | ------------------------------------- | -------------- |
| GET    | `/planai/hr/employees`                           | JWT  | `?department?, page, pageSize`                             | Paginated employees                   |
| POST   | `/planai/hr/employees`                           | JWT  | `{ name, email, role, department, salaryKobo, startDate }` | `Employee`                            |
| GET    | `/planai/hr/employees/:id`                       | JWT  | —                                                          | `Employee + payHistory[]`             |
| PATCH  | `/planai/hr/employees/:id`                       | JWT  | Partial employee                                           | `Employee`                            |
| POST   | `/planai/hr/employees/:id/terminate`             | JWT  | `{ reason, lastDay }`                                      | `{ offboarded: true }`                |
| GET    | `/planai/hr/payroll/:month`                      | JWT  | —                                                          | `{ employees[], totalKobo, status }`  |
| POST   | `/planai/hr/payroll/:month/run`                  | JWT  | —                                                          | `{ jobId }` — async payroll processor |
| GET    | `/planai/hr/payroll/:month/payslips/:employeeId` | JWT  | —                                                          | PDF payslip                           |
| POST   | `/planai/hr/leave/requests`                      | JWT  | `{ employeeId, type, from, to, reason }`                   | `LeaveRequest`                        |
| PATCH  | `/planai/hr/leave/requests/:id`                  | JWT  | `{ status: 'APPROVED'                                      | 'REJECTED' }`                         | `LeaveRequest` |
| GET    | `/planai/hr/leave/balance/:employeeId`           | JWT  | —                                                          | `{ annual, sick, used }`              |

---

**PLANAI 12 — Fitness Center** (`/planai/fitness/*`)

| Method | Path                            | Auth | Body                                                                                                     | Returns                               |
| ------ | ------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| GET    | `/planai/fitness/profile`       | JWT  | —                                                                                                        | `FitnessProfile`                      |
| POST   | `/planai/fitness/profile`       | JWT  | `{ goal, fitnessLevel, weightKg?, heightCm?, age?, gender?, hasGymAccess, dietaryPrefs[], allergies[] }` | `FitnessProfile`                      |
| PATCH  | `/planai/fitness/profile`       | JWT  | Partial                                                                                                  | `FitnessProfile`                      |
| POST   | `/planai/fitness/plan/generate` | JWT  | `{ durationWeeks, daysPerWeek }`                                                                         | `WorkoutPlan` (AI-generated)          |
| GET    | `/planai/fitness/plans`         | JWT  | —                                                                                                        | `WorkoutPlan[]`                       |
| GET    | `/planai/fitness/plans/:id`     | JWT  | —                                                                                                        | `WorkoutPlan`                         |
| POST   | `/planai/fitness/workouts/log`  | JWT  | `{ type, durationMinutes, exercises[], caloriesBurned?, mood? }`                                         | `WorkoutLog`                          |
| GET    | `/planai/fitness/workouts`      | JWT  | `?from, to, page, pageSize`                                                                              | Paginated `WorkoutLog[]`              |
| POST   | `/planai/fitness/meals/log`     | JWT  | `{ mealName, mealType, calories, foods?, isNigerianDish, date }`                                         | `MealLog`                             |
| GET    | `/planai/fitness/meals`         | JWT  | `?date?, page, pageSize`                                                                                 | Paginated `MealLog[]`                 |
| GET    | `/planai/fitness/meals/search`  | JWT  | `?query`                                                                                                 | Nigerian food database search results |
| POST   | `/planai/fitness/body/log`      | JWT  | `{ weight?, bodyFat?, muscleMass?, notes? }`                                                             | `BodyMetricLog`                       |
| GET    | `/planai/fitness/body/history`  | JWT  | `?from, to`                                                                                              | `BodyMetricLog[]`                     |
| GET    | `/planai/fitness/streak`        | JWT  | —                                                                                                        | `FitnessStreak`                       |
| GET    | `/planai/fitness/leaderboard`   | JWT  | `?limit=50`                                                                                              | Ranked `FitnessStreak[]`              |

---

**PLANAI 13 — Marketplace** (`/planai/marketplace/*` and public `/marketplace/*`)

| Method | Path                                        | Auth   | Body                                                                  | Returns                                   |
| ------ | ------------------------------------------- | ------ | --------------------------------------------------------------------- | ----------------------------------------- | ------------------------------- | ------------------ |
| GET    | `/marketplace/listings`                     | Public | `?category?, location?, type: 'service'                               | 'digital'                                 | 'all', search?, page, pageSize` | Paginated listings |
| GET    | `/marketplace/listings/:id`                 | Public | —                                                                     | `Listing + provider`                      |
| POST   | `/planai/marketplace/listings`              | JWT    | `{ type, title, description, price, category, location?, videoUrl? }` | `Listing`                                 |
| PATCH  | `/planai/marketplace/listings/:id`          | JWT    | Partial listing                                                       | `Listing`                                 |
| DELETE | `/planai/marketplace/listings/:id`          | JWT    | —                                                                     | `{ deactivated: true }`                   |
| POST   | `/marketplace/bookings`                     | JWT    | `{ listingId, date?, notes?, quantity? }`                             | `Booking` (escrow initiated)              |
| GET    | `/planai/marketplace/bookings`              | JWT    | `?role: 'buyer'                                                       | 'seller', status?, page, pageSize`        | Paginated `Booking[]`           |
| POST   | `/planai/marketplace/bookings/:id/complete` | JWT    | —                                                                     | `{ completed: true }` — releases escrow   |
| POST   | `/planai/marketplace/bookings/:id/dispute`  | JWT    | `{ reason }`                                                          | `Dispute`                                 |
| POST   | `/marketplace/listings/:id/review`          | JWT    | `{ rating, comment }`                                                 | `Review`                                  |
| GET    | `/marketplace/listings/:id/reviews`         | Public | `?page, pageSize`                                                     | Paginated `Review[]`                      |
| GET    | `/planai/marketplace/earnings`              | JWT    | `?from, to`                                                           | `{ totalKobo, pending, paid, byMonth[] }` |

---

### 4.15 VillageCircle Sub-modules

**Module:** `src/modules/villagecircle/`

**Waitlist:**

| Method | Path                                              | Auth   | Body                       | Returns                          |
| ------ | ------------------------------------------------- | ------ | -------------------------- | -------------------------------- |
| POST   | `/villagecircle/waitlist/:productSlug`            | Public | `{ email, name? }`         | `{ position, joined: true }`     |
| GET    | `/villagecircle/waitlist/:productSlug/position`   | Public | `?email`                   | `{ position, status }`           |
| GET    | `/villagecircle/waitlist/:productSlug`            | Admin  | `?page, pageSize, status?` | Paginated `WaitlistEntry[]`      |
| PATCH  | `/villagecircle/waitlist/:productSlug/:id/invite` | Admin  | —                          | `WaitlistEntry (status=INVITED)` |

**Vibe Coders (application pipeline):**

| Method | Path                                                 | Auth   | Body                                                                                    | Returns                                                           |
| ------ | ---------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| POST   | `/villagecircle/vibecoders/apply`                    | Public | `{ name, email, whatsapp, archetype, idea, obstacle, commitment }`                      | `VibeCoderApplicant (status=APPLIED)`                             |
| GET    | `/villagecircle/vibecoders/assessment`               | Token  | `?token=<assessmentToken>`                                                              | Assessment questions                                              |
| POST   | `/villagecircle/vibecoders/assessment`               | Token  | `{ token, answers: Record<questionId, string> }`                                        | `{ submitted: true }`                                             |
| GET    | `/villagecircle/vibecoders/applicants`               | Admin  | `?status?, cohortId?, page, pageSize`                                                   | Paginated `VibeCoderApplicant[]`                                  |
| PATCH  | `/villagecircle/vibecoders/applicants/:id/shortlist` | Admin  | —                                                                                       | `VibeCoderApplicant (status=SHORTLISTED, sends assessment email)` |
| PATCH  | `/villagecircle/vibecoders/applicants/:id/accept`    | Admin  | `{ cohortId, paymentPath }`                                                             | `VibeCoderApplicant (status=ACCEPTED, sends payment link)`        |
| PATCH  | `/villagecircle/vibecoders/applicants/:id/reject`    | Admin  | `{ reason? }`                                                                           | `VibeCoderApplicant (status=REJECTED)`                            |
| GET    | `/villagecircle/vibecoders/cohorts`                  | Public | —                                                                                       | `VibeCoderCohort[]`                                               |
| POST   | `/villagecircle/vibecoders/cohorts`                  | Admin  | `{ name, slug, startDate, endDate, applicationDeadline, capacity, priceMin, priceMax }` | `VibeCoderCohort`                                                 |

**KoloAI:**

| Method | Path                                           | Auth  | Body                                                    | Returns                    |
| ------ | ---------------------------------------------- | ----- | ------------------------------------------------------- | -------------------------- |
| POST   | `/villagecircle/kolo/groups`                   | JWT   | `{ name, contributionKobo, payoutInterval, members[] }` | `KoloGroup`                |
| GET    | `/villagecircle/kolo/groups`                   | JWT   | —                                                       | `KoloGroup[]` (member of)  |
| POST   | `/villagecircle/kolo/groups/:id/contribute`    | JWT   | `{ amountKobo, paymentRef }`                            | `Contribution`             |
| GET    | `/villagecircle/kolo/groups/:id/contributions` | JWT   | `?page, pageSize`                                       | Paginated contributions    |
| GET    | `/villagecircle/kolo/groups/:id/risk-report`   | Admin | —                                                       | AI default risk per member |

**BorderlessRemit:**

| Method | Path                           | Auth   | Body                                  | Returns                                                      |
| ------ | ------------------------------ | ------ | ------------------------------------- | ------------------------------------------------------------ |
| GET    | `/villagecircle/remit/rates`   | Public | `?from=USD&to=NGN`                    | `{ rate, source, updatedAt }[]`                              |
| GET    | `/villagecircle/remit/compare` | Public | `?amount, from, to`                   | `{ providers: [{name, rate, fee, estimatedReceive, time}] }` |
| POST   | `/villagecircle/remit/alert`   | JWT    | `{ email, fromCurrency, targetRate }` | `{ alertId }`                                                |

**ReceiptGenius:**

| Method | Path                               | Auth | Body                                                   | Returns                 |
| ------ | ---------------------------------- | ---- | ------------------------------------------------------ | ----------------------- | ---------- | -------- | ---------------- |
| POST   | `/villagecircle/receipts`          | JWT  | `{ customerName, items[], vatPercent?, businessInfo }` | `{ receipt, pdfUrl }`   |
| GET    | `/villagecircle/receipts`          | JWT  | `?page, pageSize, from?, to?`                          | Paginated receipts      |
| GET    | `/villagecircle/receipts/:id`      | JWT  | —                                                      | Receipt                 |
| GET    | `/villagecircle/receipts/:id/pdf`  | JWT  | —                                                      | PDF binary              |
| POST   | `/villagecircle/receipts/:id/send` | JWT  | `{ to: email                                           | phone, channel: 'email' | 'whatsapp' | 'sms' }` | `{ sent: true }` |

**SafeAI:**

| Method | Path                                          | Auth          | Body                                                                                       | Returns                    |
| ------ | --------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| POST   | `/villagecircle/safeai/incidents`             | Public/JWT    | `{ incidentType, description, latitude, longitude, address?, isAnonymous, evidenceUrls? }` | `Incident`                 |
| GET    | `/villagecircle/safeai/incidents`             | Admin/Officer | `?status?, severity?, city?, page, pageSize`                                               | Paginated `Incident[]`     |
| GET    | `/villagecircle/safeai/incidents/:id`         | Admin/Officer | —                                                                                          | `Incident + updates[]`     |
| PATCH  | `/villagecircle/safeai/incidents/:id`         | Admin/Officer | `{ status?, officerNotes?, assignedOfficerId? }`                                           | `Incident`                 |
| POST   | `/villagecircle/safeai/incidents/:id/updates` | Admin/Officer | `{ updateType, message, attachments? }`                                                    | `IncidentUpdate`           |
| GET    | `/villagecircle/safeai/hotspots`              | Public        | `?city?, state?`                                                                           | `CrimeHotspot[]`           |
| GET    | `/villagecircle/safeai/alerts`                | Public        | `?severity?, city?`                                                                        | `SafetyAlert[]`            |
| POST   | `/villagecircle/safeai/emergency`             | Public        | `{ emergencyType, description, latitude, longitude, callerPhone? }`                        | `EmergencyResponse`        |
| GET    | `/villagecircle/safeai/wanted`                | Public        | `?status=ACTIVE, page, pageSize`                                                           | Paginated `WantedPerson[]` |

**FarmGate:**

| Method | Path                                   | Auth   | Body                                                      | Returns                              |
| ------ | -------------------------------------- | ------ | --------------------------------------------------------- | ------------------------------------ |
| GET    | `/villagecircle/farmgate/listings`     | Public | `?category?, state?, search?, page, pageSize`             | Paginated produce listings           |
| POST   | `/villagecircle/farmgate/listings`     | JWT    | `{ produce, quantity, unit, priceKobo, state, images[] }` | `ProduceListing`                     |
| GET    | `/villagecircle/farmgate/listings/:id` | Public | —                                                         | `ProduceListing`                     |
| PATCH  | `/villagecircle/farmgate/listings/:id` | JWT    | Partial                                                   | `ProduceListing`                     |
| POST   | `/villagecircle/farmgate/orders`       | JWT    | `{ listingId, quantity, deliveryAddress }`                | `{ orderId, totalKobo, paymentUrl }` |
| GET    | `/villagecircle/farmgate/prices`       | Public | `?produce, state?`                                        | `{ current, trend, lastWeek }`       |

**NaijaGig / Skill2Cash:**

| Method | Path                                   | Auth   | Body                                                                  | Returns                |
| ------ | -------------------------------------- | ------ | --------------------------------------------------------------------- | ---------------------- |
| GET    | `/villagecircle/gig/listings`          | Public | `?category?, location?, page, pageSize`                               | Paginated gig listings |
| POST   | `/villagecircle/gig/listings`          | JWT    | `{ title, category, description, rateKobo, availability, videoUrl? }` | `GigListing`           |
| POST   | `/villagecircle/gig/listings/:id/book` | JWT    | `{ date?, notes? }`                                                   | `Booking`              |
| GET    | `/villagecircle/skill2cash/profile`    | Public | `?userId`                                                             | `VideoProfile`         |
| POST   | `/villagecircle/skill2cash/profile`    | JWT    | multipart `{ videoFile, title, skills[] }`                            | `VideoProfile`         |

**AfroHustle:**

| Method | Path                                                  | Auth       | Body                         | Returns                        |
| ------ | ----------------------------------------------------- | ---------- | ---------------------------- | ------------------------------ |
| GET    | `/villagecircle/afrohustle/blueprints`                | Public/JWT | `?category?, page, pageSize` | Paginated `Blueprint[]`        |
| GET    | `/villagecircle/afrohustle/blueprints/:slug`          | Public/JWT | —                            | `Blueprint` (gated if premium) |
| POST   | `/villagecircle/afrohustle/blueprints/:slug/purchase` | JWT        | —                            | `{ paymentUrl }`               |

---

### 4.16 Admin

**Module:** `src/modules/admin/`

| Method | Path                           | Auth       | Body / Query                                                  | Returns                                                            |
| ------ | ------------------------------ | ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | -------- | ------------------- |
| GET    | `/admin/dashboard`             | Admin      | —                                                             | `{ users, revenue, subscriptions, activeProducts, recentSignups }` |
| GET    | `/admin/users`                 | Admin      | `?page, pageSize, role?, isBanned?, search?`                  | Paginated `User[]`                                                 |
| PATCH  | `/admin/users/:id/ban`         | Admin      | `{ reason }`                                                  | `User (isBanned=true)`                                             |
| PATCH  | `/admin/users/:id/unban`       | Admin      | —                                                             | `User (isBanned=false)`                                            |
| PATCH  | `/admin/users/:id/role`        | SuperAdmin | `{ role }`                                                    | `User`                                                             |
| POST   | `/admin/wallet/credit`         | Admin      | `{ userId, amountKobo, description, source: 'ADMIN_CREDIT' }` | `WalletLedger`                                                     |
| POST   | `/admin/wallet/lock`           | Admin      | `{ userId, reason }`                                          | `{ locked: true }`                                                 |
| GET    | `/admin/payments`              | Admin      | `?status?, productSlug?, page, pageSize, from?, to?`          | Paginated `Payment[]`                                              |
| GET    | `/admin/subscriptions`         | Admin      | `?status?, productSlug?, page, pageSize`                      | Paginated `Subscription[]`                                         |
| GET    | `/admin/logs`                  | Admin      | `?adminId?, action?, page, pageSize`                          | Paginated `AdminLog[]`                                             |
| GET    | `/admin/analytics/revenue`     | Admin      | `?from, to, groupBy: 'day'                                    | 'week'                                                             | 'month'` | Revenue time-series |
| GET    | `/admin/vibecoders/applicants` | Admin      | `?status?, cohortId?, page, pageSize`                         | Paginated applicants                                               |
| GET    | `/health`                      | Public     | —                                                             | `{ status: 'ok', uptime, database, redis }`                        |

---

### 4.17 Developer / Enterprise API ⚡ MISSING

**Module to create:** `src/modules/api/`
**Auth:** `X-API-Key: bm_live_xxxxxxxxxx` header (ApiKeyGuard)

**API Key Management (JWT auth — user managing their own keys):**

| Method | Path                       | Auth      | Body                             | Returns                                                | Notes                            |
| ------ | -------------------------- | --------- | -------------------------------- | ------------------------------------------------------ | -------------------------------- |
| POST   | `/developer/keys`          | JWT       | `{ name, scopes[], expiresAt? }` | `{ key: 'bm_live_...', prefix, scopes }`               | Full key shown ONCE, never again |
| GET    | `/developer/keys`          | JWT       | —                                | `{ id, prefix, scopes, tier, lastUsedAt, isActive }[]` | No full key                      |
| DELETE | `/developer/keys/:id`      | JWT       | —                                | `{ revoked: true }`                                    |
| GET    | `/developer/keys/validate` | X-API-Key | —                                | `{ valid: true, scopes[], tier }`                      |

**Scopes map:**

```
amebogist:read           → Read published articles
educenter:questions      → Fetch JAMB/WAEC questions
educenter:submit         → Submit answers on behalf of students
planai:social:generate   → Generate captions
planai:branding:logo     → Generate logos
villagecircle:waitlist   → Add to concept waitlists
users:profile:read       → Read authenticated user profile
payments:verify          → Verify payment status
polymind:query           → PolyMind AI comparison proxy
webhook:subscribe        → Subscribe to BoldmindNG events
```

**Public Enterprise API Endpoints (X-API-Key auth):**

| Method | Path                                   | Scope                    | Returns                                  |
| ------ | -------------------------------------- | ------------------------ | ---------------------------------------- |
| GET    | `/public/amebogist/posts`              | `amebogist:read`         | Paginated published posts                |
| GET    | `/public/amebogist/posts/:slug`        | `amebogist:read`         | Single post                              |
| GET    | `/public/educenter/questions`          | `educenter:questions`    | `?examType, subject, count` → Question[] |
| POST   | `/public/educenter/submit`             | `educenter:submit`       | `{ sessionId, answers }` → results       |
| POST   | `/public/planai/social/caption`        | `planai:social:generate` | Caption text                             |
| POST   | `/public/planai/branding/logo`         | `planai:branding:logo`   | `{ jobId }`                              |
| POST   | `/public/villagecircle/waitlist/:slug` | `villagecircle:waitlist` | `{ position }`                           |
| GET    | `/public/payments/verify/:reference`   | `payments:verify`        | `Payment` status                         |

**Webhook Subscriptions (JWT auth):**

| Method | Path                      | Auth | Body                        | Returns                 |
| ------ | ------------------------- | ---- | --------------------------- | ----------------------- |
| POST   | `/developer/webhooks`     | JWT  | `{ url, events[], secret }` | `WebhookSubscription`   |
| GET    | `/developer/webhooks`     | JWT  | —                           | `WebhookSubscription[]` |
| DELETE | `/developer/webhooks/:id` | JWT  | —                           | `{ deleted: true }`     |

**Outgoing webhook events BoldmindNG fires:**

```
payment.success
payment.failed
subscription.activated
subscription.cancelled
article.published
user.registered
vibecoders.applicant.applied
```

---

### 4.18 PolyMind Proxy ⚡ MISSING

**Module to create:** `src/modules/polymind/`
**Auth:** `X-API-Key` with scope `polymind:query`

| Method | Path                | Auth      | Body                                                  | Returns                                     |
| ------ | ------------------- | --------- | ----------------------------------------------------- | ------------------------------------------- |
| POST   | `/polymind/openai`  | X-API-Key | `{ prompt, systemPrompt?, maxTokens?, temperature? }` | `{ content, model, tokensUsed, latencyMs }` |
| POST   | `/polymind/claude`  | X-API-Key | Same body                                             | Same response shape                         |
| POST   | `/polymind/gemini`  | X-API-Key | Same body                                             | Same response shape                         |
| POST   | `/polymind/groq`    | X-API-Key | Same body                                             | Same response shape                         |
| POST   | `/polymind/mistral` | X-API-Key | Same body                                             | Same response shape                         |
| GET    | `/polymind/history` | X-API-Key | `?page, pageSize`                                     | Paginated `PolyMindComparison[]`            |

All providers must return the **same response shape** so the extension can render them uniformly:

```typescript
interface PolyMindResponse {
  content: string;
  model: string; // e.g. "gpt-4o", "claude-3-5-sonnet-20241022"
  tokensUsed: number;
  latencyMs: number;
  error?: string; // if provider failed, content is "" and error is set
}
```

---

## 3. Redis & Queue Reference Implementation

_Merged from addendum §F._ This service is the owner of the three-Redis split; the complete
implementation lives here so it doesn't need to be looked up in the system-design doc.

### 3.1 `src/database/redis.service.ts` — Complete File

```typescript
// boldmind-service/src/database/redis.service.ts
// REPLACES the single-instance Redis service

import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /**
   * SESSION — SSO relay tokens, JWT refresh families, OTP codes,
   *           rate limit counters, feature flags.
   * Upstash config: 256MB, AOF persistence, max-memory-policy=noeviction
   */
  readonly session: Redis;

  /**
   * QUEUE — BullMQ ONLY. Never use for reads/writes directly.
   * Upstash config: 1GB+, RDB persistence, max-memory-policy=noeviction
   */
  readonly queue: Redis;

  /**
   * CACHE — ALOC questions, exchange rates, computed stats, feature flags.
   * Upstash config: 512MB, no persistence, max-memory-policy=allkeys-lru
   */
  readonly cache: Redis;

  constructor(private config: ConfigService) {
    this.session = this.createClient("REDIS_SESSION_URL", "session");
    this.queue = this.createClient("REDIS_QUEUE_URL", "queue");
    this.cache = this.createClient("REDIS_CACHE_URL", "cache");
  }

  private createClient(envKey: string, label: string): Redis {
    const url = this.config.getOrThrow<string>(envKey);
    const client = new Redis(url, {
      maxRetriesPerRequest: null, // required by BullMQ
      lazyConnect: false,
      reconnectOnError: (err) => {
        this.logger.error(`Redis [${label}] error: ${err.message}`);
        return true;
      },
    });

    client.on("connect", () => this.logger.log(`Redis [${label}] connected`));
    client.on("error", (e) =>
      this.logger.error(`Redis [${label}] error`, e.message),
    );
    client.on("close", () =>
      this.logger.warn(`Redis [${label}] connection closed`),
    );

    return client;
  }

  onModuleDestroy(): void {
    this.logger.log("Closing Redis connections...");
    this.session.quit();
    this.queue.quit();
    this.cache.quit();
  }
}
```

```typescript
// src/app.module.ts — BullMQ uses QUEUE redis only
BullModule.forRootAsync({
  inject:      [RedisService],
  useFactory:  (redis: RedisService) => ({
    connection: redis.queue,   // ← QUEUE instance ONLY
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail:     { age: 7 * 24 * 3600 },
    },
  }),
}),
```

### 3.2 `src/common/constants/queues.ts` — Complete File

```typescript
export const QUEUES = {
  // ── Communication ──────────────────────────────────────────────
  EMAIL_NOTIFICATIONS: "email-notifications", // Via Resend, 3× exp retry
  SMS_OTP: "sms-otp", // WhatsApp → SMS fallback, HIGH priority

  // ── Content & Social ───────────────────────────────────────────
  SOCIAL_PUBLISHING: "social-publishing", // Delayed BullMQ jobs
  AI_GENERATION: "ai-generation", // Provider fallback chain
  IMAGE_GENERATION: "image-generation", // fal.ai → DALL-E fallback

  // ── Business Operations ────────────────────────────────────────
  PAYROLL_PROCESSING: "payroll-processing", // Idempotent, HIGH, 0 retries
  MEDIA_PROCESSING: "media-processing", // R2 upload + virus scan

  // ── Payments & Wallet ──────────────────────────────────────────
  PAYMENT_WEBHOOK: "payment-webhook", // CRITICAL, 5× with 10s backoff
  WALLET_CREDIT: "wallet-credit", // HIGH, must never fail, 3× retry

  // ── Background Intelligence ────────────────────────────────────
  TREND_ANALYSIS: "trend-analysis", // Cron every 2h, LOW priority
  KOLO_REMINDERS: "kolo-reminders", // WhatsApp reminders

  // ── Enterprise & Extensions ────────────────────────────────────
  POLYMIND_QUERY: "polymind-query", // PolyMind fan-out AI calls
  WEBHOOK_DELIVERY: "webhook-delivery", // Enterprise webhook delivery, 3× exp

  // ── Data Hygiene ───────────────────────────────────────────────
  NDPA_ERASURE: "ndpa-erasure", // Cron: daily midnight Lagos, 0 retries
  SEO_SITEMAP: "seo-sitemap", // Cron: nightly, 0 retries
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

// Priority: 1 = highest, 10 = lowest (BullMQ convention)
export const QUEUE_PRIORITIES: Record<QueueName, number> = {
  [QUEUES.PAYMENT_WEBHOOK]: 1,
  [QUEUES.WALLET_CREDIT]: 2,
  [QUEUES.SMS_OTP]: 2,
  [QUEUES.PAYROLL_PROCESSING]: 3,
  [QUEUES.EMAIL_NOTIFICATIONS]: 5,
  [QUEUES.SOCIAL_PUBLISHING]: 5,
  [QUEUES.AI_GENERATION]: 5,
  [QUEUES.IMAGE_GENERATION]: 5,
  [QUEUES.MEDIA_PROCESSING]: 5,
  [QUEUES.KOLO_REMINDERS]: 5,
  [QUEUES.POLYMIND_QUERY]: 5,
  [QUEUES.WEBHOOK_DELIVERY]: 5,
  [QUEUES.TREND_ANALYSIS]: 8,
  [QUEUES.SEO_SITEMAP]: 9,
  [QUEUES.NDPA_ERASURE]: 9,
};
```

---

## 4. Known Issues — Launch Blockers in This Repo

_Merged from addendum §K._ These are the items flagged against this repo's actual source.

### 4.1 Google OAuth Double-Call Bug — `auth.controller.ts` (BLOCKING)

```typescript
// ❌ CURRENT (BUG — wrong args on the second call):
const relayToken = await this.ssoService.createRelayToken(user.id, accessToken);
const relayUrl = await this.ssoService.createRelayToken(returnUrl, relayToken); // ← WRONG

// ✅ FIX — use buildSsoRelayUrl instead:
const relayUrl = await this.ssoService.buildSsoRelayUrl(
  user.id,
  accessToken,
  returnUrl,
  {}, // empty UTM on OAuth redirect
);
return res.redirect(relayUrl);
```

This affects the `GET /auth/google/callback` route documented in §4.1 above — do not ship
Google OAuth cross-domain redirects until this is fixed.

### 4.2 `kolo-ai/translation.schema.ts` — Probable Misnaming

```
Current file: src/modules/villagecircle/kolo-ai/translation.schema.ts
Expected:     src/modules/villagecircle/kolo-ai/kolo-group.schema.ts
```

When building the Wave 5 KoloAI feature (§4.15 VillageCircle Sub-modules → KoloAI), rename the
file and update the import in `kolo-ai.module.ts`.

---

## 5. Environment Variables — Complete Checklist

_Merged from addendum §L._ This is the full list this service needs across all 8 groups.

```env
# ─── DATABASE ─────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://...                # Neon PostgreSQL (Prisma)
MONGODB_URI=mongodb+srv://...               # MongoDB Atlas (Mongoose)

# ─── REDIS (3 INSTANCES — all required after Wave 0) ─────────────────────────
REDIS_SESSION_URL=redis://default:<pw>@<host>:6379   # SSO, OTP, rate limits
REDIS_QUEUE_URL=redis://default:<pw>@<host>:6379     # BullMQ ONLY
REDIS_CACHE_URL=redis://default:<pw>@<host>:6379     # ALOC, rates, stats

# ─── AUTH ─────────────────────────────────────────────────────────────────────
JWT_SECRET=<64-char hex>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=https://api.boldmind.ng/api/v1/auth/google/callback

# ─── PAYMENTS ─────────────────────────────────────────────────────────────────
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_WEBHOOK_SECRET=

# ─── AI PROVIDERS ─────────────────────────────────────────────────────────────
OPENAI_API_KEY=                             # GPT-4o (primary)
ANTHROPIC_API_KEY=                          # Claude (PolyMind proxy)
GOOGLE_GEMINI_API_KEY=                      # Gemini (PolyMind proxy)
GROQ_API_KEY=                               # Groq/LLaMA (PolyMind proxy)
CLOUDFLARE_AI_TOKEN=                        # Cloudflare Workers AI
CLOUDFLARE_ACCOUNT_ID=
FAL_API_KEY=                                # fal.ai FLUX image generation
OLLAMA_BASE_URL=http://localhost:11434      # Local Ollama (dev only)

# ─── COMMUNICATIONS ───────────────────────────────────────────────────────────
RESEND_API_KEY=                             # Email via Resend
TERMII_API_KEY=                             # SMS fallback via Termii
TERMII_SENDER_ID=BOLDMIND                   # NCC-registered sender ID
META_WHATSAPP_PHONE_NUMBER_ID=              # WhatsApp Business OTP (primary)
META_WHATSAPP_ACCESS_TOKEN=                 # Meta Cloud API access token
META_VERIFY_TOKEN=                          # Meta webhook verification token

# ─── STORAGE ──────────────────────────────────────────────────────────────────
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_ENDPOINT=                    # https://<accountid>.r2.cloudflarestorage.com
CLOUDFLARE_STREAM_TOKEN=                   # Cloudflare Stream (video)

# ─── INTEGRATIONS ─────────────────────────────────────────────────────────────
ALOC_API_KEY=                              # EduCenter exam questions
ALOC_BASE_URL=

# ─── WEB PUSH / PWA ───────────────────────────────────────────────────────────
VAPID_PUBLIC_KEY=                          # Also needed as NEXT_PUBLIC_VAPID_PUBLIC_KEY on frontends
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:hello@boldmind.ng

# ─── ENTERPRISE API ───────────────────────────────────────────────────────────
API_KEY_ENCRYPTION_SECRET=<32-char hex>    # Used in ApiKeyGuard SHA-256 hash
WEBHOOK_DELIVERY_TIMEOUT_MS=5000

# ─── APP ──────────────────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=production
API_VERSION=v1
FRONTEND_URLS=https://boldmind.ng,https://planai.boldmind.ng,https://educenter.com.ng,https://villagecircle.ng,https://amebogist.ng
CORS_ORIGINS=                              # Same as FRONTEND_URLS
HUB_URL=https://boldmind.ng               # Used in auth.controller.ts post-login redirect
```

_See `boldmind-system-design-v2-merged.md` §21 for the accompanying frontend
(`NEXT*PUBLIC*_`) environment variables required by the five Next.js apps.\*

---

_boldmind-service-canonical.md v1.1 (updated) | June 2026_
_Merged with: boldmind-system-design-v2-alignment-addendum.md §F, §K, §L_
