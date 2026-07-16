# The Upstash error makes sense once you look at how BullMQ actually talks to Redis

The Upstash error makes sense once you look at how BullMQ actually talks to Redis — this is a very common trap, not something wrong with your code per se.

## Why you're blowing through 500k requests

Upstash bills **per command**, and BullMQ workers use blocking-poll patterns (`BZPOPMIN`/stream reads for delayed jobs, stalled-job checks, rate-limiter checks) that fire continuously — even when the queue is empty. With 15+ queues registered in `QueuesModule` and however many actually have active `@Processor` workers attached, you can burn through hundreds of thousands of commands per day just from idle polling. This is a known mismatch: **Upstash's serverless/pay-per-request model is a bad fit for BullMQ**, which was designed for a persistent, "free to poll" Redis connection. Lots of people hit exactly this wall.

Two things compound it in your setup specifically:

1. Every queue in `queues.ts` gets registered via `QueuesModule` (producer side), but I can't tell from what I have which ones also have a `@Processor` consumer actually running (your own comments flag `NOTIFICATIONS_DISPATCH` and `CONTENT_PROCESSING` as "VERIFY — no processor class currently visible"). Registered-but-unconsumed queues are cheap; queues with an active `Worker` polling are the expensive ones.
2. If anything creates a `QueueEvents` instance (event listening across processes), that uses Redis Streams with a long-polling `XREAD` — this is the single most request-hungry pattern in BullMQ. Worth checking if any admin/dashboard tooling (Bull Board, etc.) is wired in anywhere.

## Recommendation: move `REDIS_QUEUE_URL` off Upstash to Railway Redis

Since you're already on Railway for the service itself, Railway's Redis plugin is the right fix specifically for the **queue** instance — it's billed on memory/compute, not per-command, so BullMQ's chatty polling costs you nothing extra. Your `RedisService` architecture (three separate URLs) already supports this with zero code changes — you'd only touch env vars:

```env
# Move only the queue instance:
REDIS_QUEUE_URL=redis://default:<password>@<railway-redis-host>:6379

# SESSION and CACHE can stay on Upstash — they're low-volume,
# request-light (SSO tokens, OTP, rate limits, ALOC cache) and
# actually benefit from Upstash's serverless scale-to-zero pricing.
```

This matches your existing "three-split" design intent — nothing architectural changes, just which provider backs which instance. Your `redis.service.ts` already handles TLS detection (`rediss://` or `.upstash.io`) automatically, so a plain Railway `redis://` URL will just skip TLS and work as-is.

**Before you migrate**, I'd like to see the processor files to rule out a `QueueEvents` leak (which would blow through Railway's limits too eventually, just less immediately fatal):

- `src/modules/automation/queue/*.processor.ts` (ai-jobs, email-campaign, social-post)
- `src/modules/wallet/queue/wallet-credit.processor.ts`
- `src/modules/planai/processors/planai.processor.ts`
- `src/modules/notification/processors/*.processor.ts`
- `src/modules/ai/processors/social-factory.processor.ts`

Can you paste those (or run `grep -rn "QueueEvents\|new Queue(" src/` and share the output)? That'll tell us if there's a genuine bug versus just "BullMQ + Upstash was always going to hit this ceiling eventually."

---

## The v2 "real update" wave plan

Agreed — moving from patches to a proper pass. Here's the flow, sequenced so nothing downstream breaks while upstream is mid-change:

**Wave A — Inventory (no code changes)**

1. Enumerate every endpoint actually implemented in `boldmind-service` right now (controller-by-controller, not the canonical doc's aspirational list) — I'll need the actual controller files, not just the tree.
2. Cross-reference against `boldmind-service-canonical.md` §2 to flag: endpoints that exist but aren't documented, and documented endpoints that don't exist yet.
3. Produce one source-of-truth endpoint list (method, path, auth, request/response shape) pulled from real DTOs/decorators, not prose.

**Wave B — `api-client` package (real update, not addendum)** 4. Rewrite `client.ts` for dual-auth (`jwt` | `apikey`) per the spec already drafted in `boldmind-shared-monorepo.md` §5.1. 5. Regenerate every `*.api.ts` file against the Wave A endpoint list — including the 5 missing ones (`wallet.api.ts`, `developer.api.ts`, `polymind.api.ts`, `educenter-lms.api.ts`, `educenter-school.api.ts`). 6. Fix `os.api.ts`/`fitness.api.ts` legacy aliases to just re-export cleanly.

**Wave C — `auth` package** 7. Verify `createAuthMiddleware` protected-path lists per app match reality. 8. Confirm `buildSsoRelayUrl` is used everywhere (ties into the still-open Google OAuth double-call bug in `auth.controller.ts` — worth fixing in this same pass since `auth` package consumes it).

**Wave D — other shared packages touched by the endpoint changes** 9. `email`, `sms`, `wallet` packages — sync types/exports to match whatever Wave A found.

**Wave E — web apps** 10. Bump `@boldmindng/api-client` + `@boldmindng/auth` in each of the 5 Next.js apps one at a time (boldmind-web → planai-suite → amebogist-web → educenter-web → villagecircle-web), fixing call-site breaks as they surface from the real API shapes.

For Wave A to start, I need the actual controller files (not the tree/doc) — `notification.controller.ts` is a good first one since we were mid-work on it. Want to start there once Redis is settled, or tackle both in parallel?

```
boldmind-service
├─ .npmrc
├─ Dockerfile
├─ PLANAI-GES.md
├─ README.md
├─ TEST.TS
├─ boldmind-service-canonical.md
├─ boldmind-service-project-tree.md
├─ boldmind-system-design-v2.md
├─ nest-cli.json
├─ package.json
├─ pnpm-lock.yaml
├─ prisma
│  ├─ migrations
│  │  ├─ 20260312113544_new
│  │  │  └─ migration.sql
│  │  ├─ 20260428153216_safeai_villagecirle
│  │  │  └─ migration.sql
│  │  ├─ 20260428160307_viralkit
│  │  │  └─ migration.sql
│  │  ├─ 20260612094453_hr_crm_contact
│  │  │  └─ migration.sql
│  │  ├─ 20260621035316_wallet
│  │  │  └─ migration.sql
│  │  ├─ 20260622220602_add_hr_enum
│  │  │  └─ migration.sql
│  │  ├─ 20260711235234_user_update
│  │  │  └─ migration.sql
│  │  └─ migration_lock.toml
│  ├─ schema.prisma
│  └─ seed.ts
├─ prisma.config.ts
├─ project-manager.service.ts
├─ railway.toml
├─ redis setup.md
├─ src
│  ├─ app.module.ts
│  ├─ common
│  │  ├─ constants
│  │  │  └─ queues.ts
│  │  ├─ decorators
│  │  │  ├─ index.ts
│  │  │  ├─ permissions.decorator.ts
│  │  │  ├─ public.decorator.ts
│  │  │  ├─ roles.decorator.ts
│  │  │  └─ user.decorator.ts
│  │  ├─ filters
│  │  │  └─ http.exception.filter.ts
│  │  ├─ interceptors
│  │  │  ├─ logging.interceptor.ts
│  │  │  └─ response.interceptor.ts
│  │  ├─ queues
│  │  │  └─ queues.module.ts
│  │  └─ utils
│  │     └─ slug.util.ts
│  ├─ database
│  │  ├─ database.module.ts
│  │  ├─ prisma.service.ts
│  │  ├─ redis.service.ts
│  │  └─ validate-env.ts
│  ├─ main.ts
│  ├─ modules
│  │  ├─ admin
│  │  │  ├─ admin.controller.ts
│  │  │  ├─ admin.module.ts
│  │  │  ├─ admin.service.ts
│  │  │  └─ health.controller.ts
│  │  ├─ ai
│  │  │  ├─ ai-job.schema.ts
│  │  │  ├─ ai.controller.ts
│  │  │  ├─ ai.module.ts
│  │  │  ├─ ai.service.ts
│  │  │  ├─ processors
│  │  │  │  └─ social-factory.processor.ts
│  │  │  ├─ prompt-template.schema.ts
│  │  │  ├─ providers
│  │  │  │  ├─ cloudflare.provider.ts
│  │  │  │  ├─ fal.provider.ts
│  │  │  │  ├─ gemini.provider.ts
│  │  │  │  ├─ groq.provider.ts
│  │  │  │  ├─ ollama.provider.ts
│  │  │  │  └─ openai.provider.ts
│  │  │  └─ services
│  │  │     ├─ trend.service.ts
│  │  │     └─ video-factory.service.ts
│  │  ├─ amebogist
│  │  │  ├─ amebogist.controller.ts
│  │  │  ├─ amebogist.module.ts
│  │  │  ├─ amebogist.service.ts
│  │  │  ├─ backups
│  │  │  │  └─ 2026-02-12T01-47-02-695Z
│  │  │  │     ├─ categories.json
│  │  │  │     ├─ comments.json
│  │  │  │     ├─ keywordcaches.json
│  │  │  │     ├─ migrations.json
│  │  │  │     ├─ pagespeedcaches.json
│  │  │  │     ├─ posts.json
│  │  │  │     └─ users.json
│  │  │  ├─ dto
│  │  │  │  └─ index.ts
│  │  │  ├─ rss.service.ts
│  │  │  ├─ schemas
│  │  │  │  ├─ comment.schema.ts
│  │  │  │  ├─ creator-stats.schema.ts
│  │  │  │  ├─ post.schema.ts
│  │  │  │  └─ reaction.schema.ts
│  │  │  └─ scripts
│  │  │     ├─ backup-db.ts
│  │  │     ├─ check-gemini.ts
│  │  │     ├─ check-posts.ts
│  │  │     ├─ discover-models.ts
│  │  │     ├─ find-gemini-model.ts
│  │  │     ├─ list-models.ts
│  │  │     ├─ migrate-posts.ts
│  │  │     ├─ quick-gemini-test.ts
│  │  │     ├─ seed-sept-dec-2025.ts
│  │  │     ├─ test-db.ts
│  │  │     ├─ test-provider-direct.ts
│  │  │     └─ test-sdk-direct.ts
│  │  ├─ analytics
│  │  │  ├─ analytics.controller.ts
│  │  │  ├─ analytics.module.ts
│  │  │  └─ analytics.service.ts
│  │  ├─ api
│  │  │  ├─ api-key
│  │  │  │  └─ index.ts
│  │  │  ├─ enterprise
│  │  │  └─ webhook
│  │  │     └─ index.ts
│  │  ├─ auth
│  │  │  ├─ auth.controller.ts
│  │  │  ├─ auth.guard.ts
│  │  │  ├─ auth.module.ts
│  │  │  ├─ auth.service.ts
│  │  │  ├─ dto
│  │  │  │  ├─ auth.dto.ts
│  │  │  │  ├─ login.dto.ts
│  │  │  │  └─ register.dto.ts
│  │  │  ├─ jwt-auth.guard.ts
│  │  │  ├─ permissions.guard.ts
│  │  │  ├─ roles.guard.ts
│  │  │  ├─ sso
│  │  │  │  ├─ sso.controller.ts
│  │  │  │  └─ sso.service.ts
│  │  │  ├─ strategies
│  │  │  │  ├─ google.strategy.ts
│  │  │  │  └─ jwt.strategy.ts
│  │  │  └─ totp.util.ts
│  │  ├─ automation
│  │  │  ├─ automation.controller.ts
│  │  │  ├─ automation.module.ts
│  │  │  ├─ automation.service.ts
│  │  │  ├─ queue
│  │  │  │  ├─ ai-jobs.processor.ts
│  │  │  │  ├─ email-campaign.processor.ts
│  │  │  │  └─ social-post.processor.ts
│  │  │  └─ schema
│  │  ├─ educenter
│  │  │  ├─ dto
│  │  │  │  └─ educenter.dto.ts
│  │  │  ├─ educenter.controller.ts
│  │  │  ├─ educenter.module.ts
│  │  │  ├─ educenter.service.ts
│  │  │  ├─ lms
│  │  │  ├─ school
│  │  │  └─ services
│  │  │     └─ aloc.service.ts
│  │  ├─ hub
│  │  │  ├─ hub.controller.ts
│  │  │  ├─ hub.module.ts
│  │  │  └─ hub.service.ts
│  │  ├─ media
│  │  │  ├─ media.controller.ts
│  │  │  ├─ media.module.ts
│  │  │  └─ media.service.ts
│  │  ├─ notification
│  │  │  ├─ dto
│  │  │  │  ├─ send-email.dto.ts
│  │  │  │  ├─ send-otp.dto.ts
│  │  │  │  ├─ send-push.dto.ts
│  │  │  │  ├─ send-user-push.dto.ts
│  │  │  │  └─ send-whatsapp.dto.ts
│  │  │  ├─ notification.controller.ts
│  │  │  ├─ notification.module.ts
│  │  │  ├─ notification.service.ts
│  │  │  ├─ notification.tokens.ts
│  │  │  ├─ processors
│  │  │  │  ├─ email-broadcast.processor.ts
│  │  │  │  └─ push-broadcast.processor.ts
│  │  │  └─ providers
│  │  │     └─ resend-otp-email.provider.ts
│  │  ├─ payment
│  │  │  ├─ payment.controller.ts
│  │  │  ├─ payment.dto.ts
│  │  │  ├─ payment.module.ts
│  │  │  ├─ payment.service.ts
│  │  │  └─ subscription.service.ts
│  │  ├─ planai
│  │  │  ├─ controllers
│  │  │  │  ├─ ads-center.controller.ts
│  │  │  │  ├─ biz-agent.controller.ts
│  │  │  │  ├─ biz-directory.controller.ts
│  │  │  │  ├─ biz-intel.controller.ts
│  │  │  │  ├─ brand-home.controller.ts
│  │  │  │  ├─ fitness-center.controller.ts
│  │  │  │  ├─ hr-payroll.controller.ts
│  │  │  │  ├─ investor-kit.controller.ts
│  │  │  │  ├─ marketing-auto.controller.ts
│  │  │  │  ├─ marketplace.controller.ts
│  │  │  │  ├─ plan-crm.controller.ts
│  │  │  │  ├─ planai-suite.controller.ts
│  │  │  │  ├─ project-manager.controller.ts
│  │  │  │  ├─ social-media.controller.ts
│  │  │  │  └─ tools.controller.ts
│  │  │  ├─ dto
│  │  │  │  ├─ ads.dto.ts
│  │  │  │  ├─ ai-business-agent.dto.ts
│  │  │  │  ├─ all-planai.dto.ts
│  │  │  │  ├─ brand.dto.ts
│  │  │  │  ├─ business-discovery.dto.ts
│  │  │  │  ├─ business-intelligence.dto.ts
│  │  │  │  ├─ crm.dto.ts
│  │  │  │  ├─ fitness.dto.ts
│  │  │  │  ├─ hr-payroll.dto.ts
│  │  │  │  ├─ investor.dto.ts
│  │  │  │  ├─ job.dto.ts
│  │  │  │  ├─ marketplace.dto.ts
│  │  │  │  ├─ order.dto.ts
│  │  │  │  ├─ product.dto.ts
│  │  │  │  ├─ project-manager.dto.ts
│  │  │  │  ├─ social-media.dto.ts
│  │  │  │  ├─ suite.dto.ts
│  │  │  │  └─ template.dto.ts
│  │  │  ├─ planai.module.ts
│  │  │  ├─ planai.types.ts
│  │  │  ├─ processors
│  │  │  │  └─ planai.processor.ts
│  │  │  ├─ services
│  │  │  │  ├─ ads-center.service.ts
│  │  │  │  ├─ biz-agent.service.ts
│  │  │  │  ├─ biz-directory.service.ts
│  │  │  │  ├─ biz-intel.service.ts
│  │  │  │  ├─ brand-home.service.ts
│  │  │  │  ├─ fitness-center.service.ts
│  │  │  │  ├─ gas-webhook.service.ts
│  │  │  │  ├─ hr-payroll.service.ts
│  │  │  │  ├─ investor-kit.service.ts
│  │  │  │  ├─ marketing-auto.service.ts
│  │  │  │  ├─ marketplace.service.ts
│  │  │  │  ├─ plan-crm.service.ts
│  │  │  │  ├─ planai-analytics.service.ts
│  │  │  │  ├─ planai-job.service.ts
│  │  │  │  ├─ planai-suite.service.ts
│  │  │  │  ├─ planai-template.service.ts
│  │  │  │  ├─ project-manager.service.ts
│  │  │  │  └─ social-media.service.ts
│  │  │  └─ social-media-manager
│  │  │     └─ metawebhook.service.ts
│  │  ├─ polymind
│  │  ├─ test.md
│  │  ├─ user
│  │  │  ├─ referral.service.ts
│  │  │  ├─ user-me.controller.ts
│  │  │  ├─ user.controller.ts
│  │  │  ├─ user.dto.ts
│  │  │  ├─ user.module.ts
│  │  │  └─ user.service.ts
│  │  ├─ villagecircle
│  │  │  ├─ afrohustle
│  │  │  │  ├─ afrohustle.controller.ts
│  │  │  │  ├─ afrohustle.service.ts
│  │  │  │  └─ blueprint.schema.ts
│  │  │  ├─ borderless-remit
│  │  │  │  ├─ borderless-remit.controller.ts
│  │  │  │  ├─ borderless-remit.service.ts
│  │  │  │  └─ transfer.schema.ts
│  │  │  ├─ farmgate
│  │  │  │  ├─ farmgate.controller.ts
│  │  │  │  ├─ farmgate.service.ts
│  │  │  │  └─ produce-listing.schema.ts
│  │  │  ├─ kolo-ai
│  │  │  │  ├─ kolo-ai.controller.ts
│  │  │  │  ├─ kolo-ai.service.ts
│  │  │  │  └─ translation.schema.ts
│  │  │  ├─ naijagig
│  │  │  │  ├─ gig.schema.ts
│  │  │  │  ├─ naijagig.controller.ts
│  │  │  │  └─ naijagig.service.ts
│  │  │  ├─ receiptgenius
│  │  │  │  ├─ receipt.schema.ts
│  │  │  │  ├─ receiptgenius.controller.ts
│  │  │  │  └─ receiptgenius.service.ts
│  │  │  ├─ safeai
│  │  │  │  ├─ safeai.controller.ts
│  │  │  │  └─ safeai.service.ts
│  │  │  ├─ skill2cash
│  │  │  │  ├─ skill2cash.controller.ts
│  │  │  │  ├─ skill2cash.service.ts
│  │  │  │  └─ video-profile.schema.ts
│  │  │  ├─ vibecoders
│  │  │  │  ├─ vibecoders.controller.ts
│  │  │  │  └─ vibecoders.service.ts
│  │  │  ├─ villagecircle.module.ts
│  │  │  └─ waitlist
│  │  │     └─ waitlist.controller.ts
│  │  └─ wallet
│  │     ├─ queue
│  │     │  ├─ wallet-credit.job.ts
│  │     │  └─ wallet-credit.processor.ts
│  │     ├─ wallet.controller.ts
│  │     ├─ wallet.dto.ts
│  │     ├─ wallet.module.ts
│  │     └─ wallet.service.ts
│  └─ types
│     └─ express-multer.d.ts
├─ tsconfig.build.json
└─ tsconfig.json

```
