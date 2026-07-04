// src/common/services/gas-webhook.service.ts
//
// Thin client for the BoldmindNG Drive Automation Web App (doPost handler in
// google-apps-script/automation-script.gs §8). Lets any NestJS module fire a
// Drive-side action without boldmind-service touching Drive directly.
//
// Env vars required:
//   GAS_WEBHOOK_URL     — the deployed Web App /exec URL
//   GAS_WEBHOOK_SECRET   — must match AUTOMATION_CONFIG.WEBHOOK_SHARED_SECRET
//                          in the Apps Script project (and ideally the same
//                          value as ADMIN_TOKEN on the Vercel apps)
//
// This call is fire-and-forget from the caller's perspective — failures are
// logged, not thrown, so a Drive hiccup never blocks the actual product
// action (e.g. workspace creation) that triggered it.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GasWebhookAction =
  | { action: 'createClientProject'; projectName: string }
  | { action: 'indexPromptLibrary' }
  | { action: 'logEvent'; sheet?: string; header?: string[]; row: unknown[] };

export interface GasWebhookResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

@Injectable()
export class GasWebhookService {
  private readonly logger = new Logger(GasWebhookService.name);
  private readonly url: string | undefined;
  private readonly secret: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.url = this.config.get<string>('GAS_WEBHOOK_URL');
    this.secret = this.config.get<string>('GAS_WEBHOOK_SECRET');
  }

  /**
   * Fire-and-forget: never throws. Returns null if the webhook isn't
   * configured (e.g. local dev), so callers can safely `await` this without
   * guarding every call site with an env check.
   */
  async trigger(payload: GasWebhookAction): Promise<GasWebhookResult | null> {
    if (!this.url || !this.secret) {
      this.logger.debug('GAS_WEBHOOK_URL/SECRET not configured — skipping Drive automation trigger.');
      return null;
    }

    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: this.secret, ...payload }),
      });
      const data = (await res.json()) as GasWebhookResult;
      if (!data.ok) {
        this.logger.warn(`GAS webhook returned an error for action="${payload.action}": ${data.error}`);
      }
      return data;
    } catch (error) {
      // Drive automation is a nice-to-have, not a critical path — log and move on.
      this.logger.error(`GAS webhook call failed for action="${payload.action}": ${String(error)}`);
      return null;
    }
  }
}
