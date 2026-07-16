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
