# PlanAI → Drive Automation wiring (draft)

Two files to merge into `boldmind-service`:

```
src/common/services/gas-webhook.service.ts     ← new file, drop in as-is
src/modules/planai/services/project-manager.service.ts  ← DIFF ONLY, merge into your existing file
```

## 1. Register the service

Add `GasWebhookService` to whichever module already provides `PrismaService`
app-wide (likely `CommonModule` or `AppModule`), and export it so
`PlanAIModule` can inject it:

```ts
// src/common/common.module.ts (or wherever shared providers live)
import { Module } from "@nestjs/common";
import { GasWebhookService } from "./services/gas-webhook.service";

@Module({
  providers: [GasWebhookService],
  exports: [GasWebhookService],
})
export class CommonModule {}
```

Make sure `PlanAIModule` imports `CommonModule` (it very likely already does
for other shared providers).

## 2. Env vars

Add to `boldmind-service`'s env (and `deploy-config`'s `APP_ENV_SCHEMAS` for
`boldmind-service` per the alignment addendum §L):

```env
GAS_WEBHOOK_URL=https://script.google.com/macros/s/XXXXX/exec
GAS_WEBHOOK_SECRET=<same value as WEBHOOK_SHARED_SECRET in automation-script.gs>
```

Both are optional at runtime — `GasWebhookService.trigger()` no-ops (logs a
debug line, returns `null`) if either is missing, so this is safe to deploy
before the Apps Script Web App even exists.

## 3. What actually happens

When someone hits `POST /planai/projects/workspaces` (per
`boldmind-service-canonical.md` §4.14 PLANAI 09), the workspace is created in
Postgres as normal, then — without blocking the response — a Drive folder
gets auto-provisioned under `02 — Client Projects` using the same
`_TEMPLATE` structure the Sheet's "➕ Create New Client Project" menu item
builds by hand. Same underlying `createClientProject_()` function on the
Apps Script side either way (see `google-apps-script/CHANGELOG-v2.md` §4).

## 4. Extending this pattern

The same `GasWebhookService.trigger()` call works for any other
product-usage event you want mirrored into Drive — e.g. call it with
`{ action: 'logEvent', ... }` from `payment.service.ts` on a big invoice, or
from `hub.service.ts` when a product graduates from `_Concepts`. One
service, reused everywhere a NestJS module wants to poke Drive.
