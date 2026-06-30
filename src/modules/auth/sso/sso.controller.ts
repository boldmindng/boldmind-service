import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import {
  SsoService,
  SSO_COOKIE_NAME,
  EXTERNAL_PILLAR_DOMAINS,
} from "./sso.service";
import { AuthService } from "../auth.service";
import { JwtAuthGuard } from "../auth.guard";
import { CurrentUser } from "../../../common/decorators";
import type { JwtPayload } from "../auth.service";

// ─── Request DTOs ─────────────────────────────────────────────────────────────

class CreateRelayDto {
  destination!: string; // full URL on the external domain
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
}

class ExchangeRelayDto {
  relay!: string; // 64-char hex relay token from URL
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller("auth/sso")
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly auth: AuthService,
  ) {}

  /**
   * POST /auth/sso/relay
   *
   * Hub frontend calls this just before navigating to an external domain.
   * Returns a relay URL:  https://<external>/sso?relay=TOKEN&return_path=...&utm_*=...
   *
   * Requires: valid boldmind_sso cookie (Hub session).
   * Rate limit: 30 req/min per user (apply at infra level).
   */
  @Post("relay")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createRelay(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Body() dto: CreateRelayDto,
  ) {
    const token = req.cookies?.[SSO_COOKIE_NAME] as string | undefined;
    if (!token) throw new UnauthorizedException("No active SSO session");

    if (!dto.destination)
      throw new BadRequestException("destination is required");

    const relayUrl = await this.sso.buildSsoRelayUrl(
      user.sub,
      token,
      dto.destination,
      {
        source: dto.utmSource,
        medium: dto.utmMedium,
        campaign: dto.utmCampaign,
        content: dto.utmContent,
        term: dto.utmTerm,
      },
    );

    return { relayUrl };
  }

  /**
   * POST /auth/sso/exchange
   *
   * External domain's /sso route handler calls this after the user lands
   * with ?relay=TOKEN in the URL.
   *
   * No auth required — the relay token IS the credential.
   * One-time use: token is deleted from Redis immediately on exchange.
   * Rate limit: 10 req/min per IP (apply at infra or NestJS throttler level).
   */
  @Post("exchange")
  @HttpCode(HttpStatus.OK)
  async exchangeRelay(@Body() dto: ExchangeRelayDto) {
    if (!dto.relay || dto.relay.length !== 64) {
      throw new BadRequestException(
        "Invalid relay token format (expected 64-char hex)",
      );
    }

    let payload: { userId: string; accessToken: string };
    try {
      payload = await this.sso.exchangeRelayToken(dto.relay);
    } catch {
      throw new UnauthorizedException(
        "SSO relay token is invalid or has expired",
      );
    }

    const jwtPayload = await this.auth.verifyAccessToken(payload.accessToken);

    if (!jwtPayload) {
      throw new UnauthorizedException("Associated JWT has expired");
    }

    const user = await this.auth.validatePayload(jwtPayload).catch(() => null);
    if (!user) {
      throw new UnauthorizedException("User not found or account inactive");
    }

    return {
      accessToken: payload.accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        ecosystemRole: user.ecosystemRole,
        permissions: user.permissions,
      },
      expiresIn: 900, // 15 min in seconds — matches JWT expiry
    };
  }

  /**
   * GET /auth/sso/verify
   *
   * Lightweight liveness check polled by external domains (e.g. every 5 min)
   * to detect when the Hub session has expired.
   * Called with Authorization: Bearer <token> header from the external domain.
   */
  @Get("verify")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  verifySession(@CurrentUser() user: JwtPayload) {
    return {
      valid: true,
      userId: user.sub,
      email: user.email,
      role: user.role,
      ecosystemRole: user.ecosystemRole,
    };
  }

  /**
   * POST /auth/sso/logout-all
   *
   * Clears the Hub SSO cookie and returns logout URLs for all external domains.
   * The client is responsible for calling each external logout URL.
   */
  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // NOTE: this still only revokes server-side sessions if the
    // boldmind_sso cookie is present, even though the route is JWT-guarded.
    // A bearer-token-only caller (mobile app, API consumer) currently gets
    // a "success" response without revocation occurring. Flagged as-is;
    // fix is to call authService.logoutAll(user.sub) unconditionally here
    // if that's the intended behavior — confirm with the team before
    // changing, since it may be deliberate (cookie presence as a signal
    // this is a browser-based Hub session worth fully killing).
    const token = req.cookies?.[SSO_COOKIE_NAME] as string | undefined;
    if (token) {
      await this.auth.logoutAll(user.sub);
    }

    this.sso.clearSsoCookie(res);

    const scheme = process.env["NODE_ENV"] === "production" ? "https" : "http";
    const externalLogoutUrls = Array.from(EXTERNAL_PILLAR_DOMAINS).map(
      (domain) => `${scheme}://${domain}/api/auth/logout`,
    );

    return { success: true, externalLogoutUrls };
  }
}
