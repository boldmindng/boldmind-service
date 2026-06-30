import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as crypto from 'crypto';
import { RedisService } from '../../../database/redis.service';
import { BOLDMIND_PRODUCTS } from '@boldmindng/utils';
import type { UtmParams } from '@boldmindng/analytics';

export const SSO_COOKIE_NAME = 'boldmind_sso';
const RELAY_TTL_SECS = 60; // one-time-use, 60 second TTL

/**
 * Pillar domains that require relay token SSO.
 * boldmind.ng + *.boldmind.ng subdomains share the cookie domain natively.
 */

export const EXTERNAL_PILLAR_DOMAINS = new Set([
  'amebogist.ng',
  'educenter.com.ng',
  'villagecircle.ng',
]);

const TRUSTED_ORIGINS = new Set([
  'boldmind.ng',
  'planai.boldmind.ng',
  'marketplace.boldmind.ng',
  ...Array.from(EXTERNAL_PILLAR_DOMAINS),
]);


@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly isProd: boolean;
  private readonly cookieDomain: string;
  private readonly hubUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.isProd = this.config.get<string>('NODE_ENV') === 'production';
    // .boldmind.ng covers boldmind.ng, planai.boldmind.ng, marketplace.boldmind.ng, etc.
    this.cookieDomain = this.isProd ? '.boldmind.ng' : 'localhost';
    this.hubUrl = this.config.get<string>('HUB_URL', 'https://boldmind.ng');
  }

  // ─── Hub .boldmind.ng cookie ──────────────────────────────────────────────

  setSsoCookie(res: Response, accessToken: string): void {
    res.cookie(SSO_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: this.isProd,
      // 'none' required for cross-origin credentialed requests from external domains
      // 'lax' in dev (localhost same-origin)
      sameSite: this.isProd ? 'none' : 'lax',
      domain: this.cookieDomain,
      maxAge: 15 * 60 * 1000, // 15 min — matches JWT expiry
      path: '/',
    });
  }

  clearSsoCookie(res: Response): void {
    res.clearCookie(SSO_COOKIE_NAME, {
      domain: this.cookieDomain,
      path: '/',
    });
  }

  // ─── Relay token management ───────────────────────────────────────────────

  /**
   * createRelayToken — store access token under a relay key in Redis.
   * The external domain's /sso handler calls exchangeRelayToken() within 60s.
   *
   * Signature is fixed as (userId, accessToken) — do NOT call this a second
   * time with (destination, relayToken) to "build a URL". Use
   * buildCrossDomainUrl() for that — see below.
   */
  async createRelayToken(userId: string, accessToken: string): Promise<string> {
    const relay = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const key = `sso:relay:${relay}`;
    await this.redis.session.setex(
      key,
      RELAY_TTL_SECS,
      JSON.stringify({ userId, accessToken }),
    );
    this.logger.debug(`Relay token created for user ${userId}`);
    return relay;
  }

  /**
   * exchangeRelayToken — validate + consume relay token (one-time use).
   *
   * FIXED: previously called `this.redis.del(key)` and treated the return
   * value as the stored payload. RedisService.del() returns void (and Redis's
   * native DEL returns a deleted-key count, never the value) — that made this
   * method throw on every call. Now does an atomic GET-then-DELETE via Lua,
   * matching the pattern already used in RedisService.consumeSSOToken().
   */
  async exchangeRelayToken(relay: string): Promise<{ userId: string; accessToken: string }> {
    const key = `sso:relay:${relay}`;

    const raw = (await this.redis.session.eval(
      `local v = redis.call("GET", KEYS[1])
       if v then redis.call("DEL", KEYS[1]) end
       return v`,
      1,
      key,
    )) as string | null;

    if (!raw) throw new Error('Relay token invalid or expired');
    return JSON.parse(raw) as { userId: string; accessToken: string };
  }

  // ─── URL builders ─────────────────────────────────────────────────────────

  /**
   * buildSsoRelayUrl — creates relay token + returns full destination URL with
   * relay token + UTM params embedded as query parameters.
   *
   * The destination URL must be an external pillar domain.
   * The relay token is appended as ?relay=TOKEN on the external domain's /sso path.
   */
  async buildSsoRelayUrl(
    userId: string,
    accessToken: string,
    destination: string,
    utm: UtmParams,
  ): Promise<string> {
    const relay = await this.createRelayToken(userId, accessToken);

    let url: URL;
    try {
      url = new URL(destination);
    } catch {
      throw new Error('Invalid destination URL');
    }

    // Point to the external domain's /sso handler
    const ssoUrl = new URL('/sso', url.origin);
    ssoUrl.searchParams.set('relay', relay);
    // Preserve the original path as return_path
    const returnPath = url.pathname + url.search;
    if (returnPath && returnPath !== '/') {
      ssoUrl.searchParams.set('return_path', url.pathname);
    }
    // Thread UTM params
    this.applyUTM(ssoUrl, utm);

    return ssoUrl.toString();
  }

  /**
   * appendUTM — utility for same-domain navigation (no relay needed).
   * Just appends UTM params to a URL string.
   */
  appendUTM(destination: string, utm: UtmParams): string {
    try {
      const url = new URL(destination);
      this.applyUTM(url, utm);
      return url.toString();
    } catch {
      return destination;
    }
  }

  /**
   * buildCrossDomainUrl
   * Takes an ALREADY-CREATED relay token and builds the final redirect URL
   * with that token + UTM params. Does NOT create a new relay token itself —
   * call createRelayToken() first, then pass its result here.
   *
   * Correct controller usage (e.g. Google OAuth callback):
   *   const relayToken = await this.ssoService.createRelayToken(user.id, accessToken);
   *   const relayUrl   = this.ssoService.buildCrossDomainUrl(returnUrl, relayToken, {});
   *   return res.redirect(relayUrl);
   *
   * Do NOT call createRelayToken() a second time with (returnUrl, relayToken) —
   * that signature mismatch was the bug in the original auth.controller.ts.
   */
  buildCrossDomainUrl(
    destination: string,
    relayToken: string,
    utm: UtmParams = {},
  ): string {
    try {
      const destUrl = new URL(destination);
      const ssoUrl = new URL('/sso', destUrl.origin);

      ssoUrl.searchParams.set('relay', relayToken);

      const returnPath = destUrl.pathname + destUrl.search;
      if (returnPath && returnPath !== '/') {
        ssoUrl.searchParams.set('return_path', returnPath);
      }

      this.applyUTM(ssoUrl, utm);
      return ssoUrl.toString();
    } catch {
      return destination; // fallback — destination itself
    }
  }

  isExternalDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return EXTERNAL_PILLAR_DOMAINS.has(hostname);
    } catch {
      return false;
    }
  }

  /**
   * safeRedirectUrl
   * Returns the url if it belongs to a trusted BoldmindNG domain.
   * Falls back to Hub dashboard to prevent open-redirect vulnerabilities.
   *
   * Controller usage:
   *   return res.redirect(this.ssoService.safeRedirectUrl(returnUrl));
   */
  safeRedirectUrl(url?: string | null): string {
    const fallback = `${this.hubUrl}/dashboard`;
    if (!url) return fallback;

    try {
      const { hostname } = new URL(url);
      const clean = hostname.replace(/^www\./, '').toLowerCase();

      if (TRUSTED_ORIGINS.has(clean) || clean.endsWith('.boldmind.ng')) {
        return url;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  // ─── Product catalog helper ───────────────────────────────────────────────

  /**
   * getProductForUrl
   * Resolves the BoldmindNG product record for a given destination URL.
   * Used for analytics + logging in SSO flows.
   */
  getProductForUrl(url: string): (typeof BOLDMIND_PRODUCTS)[0] | undefined {
    try {
      const { hostname } = new URL(url);
      return BOLDMIND_PRODUCTS.find((p) => {
        const expected = p.subdomain ? `${p.subdomain}.${p.domain}` : p.domain;
        return hostname === expected || hostname === `www.${expected}`;
      });
    } catch {
      return undefined;
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private applyUTM(url: URL, utm: UtmParams): void {
    if (utm.source) url.searchParams.set('utm_source', utm.source);
    if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
    if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
    if (utm.content) url.searchParams.set('utm_content', utm.content);
    if (utm.term) url.searchParams.set('utm_term', utm.term);
  }

  isExternalPillarDomain(hostname: string): boolean {
    return EXTERNAL_PILLAR_DOMAINS.has(hostname.replace(/^www\./, ''));
  }
}