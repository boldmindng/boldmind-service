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
  Query,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "../auth.service";
import { JwtAuthGuard } from "../auth.guard";
import { CurrentUser } from "../../../common/decorators";
import type { JwtPayload } from "../auth.service";
import {
  SsoService,
  SSO_COOKIE_NAME,
  EXTERNAL_PILLAR_DOMAINS,
} from "./sso.service";

class CreateRelayDto {
  targetDomain!: string;
}

@Controller("sso")
export class SsoController {
  constructor(
    private readonly sso: SsoService,
    private readonly auth: AuthService,
  ) {}

  /**
   * POST /sso/relay
   * Body: { targetDomain: 'amebogist.ng' | 'educenter.com.ng' | 'villagecircle.ng' }
   * Returns: { relayToken, expiresIn: 60 }
   * Frontend is responsible for building the destination URL itself:
   *   https://{targetDomain}/sso?relay={relayToken}
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
    if (!dto.targetDomain)
      throw new BadRequestException("targetDomain is required");

    const clean = dto.targetDomain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "");
    if (!this.sso.isExternalPillarDomain(clean)) {
      throw new BadRequestException(
        "targetDomain must be a recognized BoldmindNG pillar domain",
      );
    }

    const relayToken = await this.sso.createRelayToken(user.sub, token);
    return { relayToken, expiresIn: 60 };
  }

  /**
   * GET /sso/exchange?token=<relayToken>
   * Public — the relay token IS the credential. One-time use.
   *
   * DEVIATION FROM SPEC: response omits `refreshToken`. Relay tokens are
   * short-lived, URL-carried, one-time-use handoffs by design (see
   * sso.service.ts docstring on createRelayToken) — embedding a 30-day
   * refresh token in that flow would let it leak via browser history,
   * referrer headers, or logs. External domains that need a persistent
   * session should call POST /auth/refresh with a refresh token obtained
   * through their own login, not through the relay handoff.
   */
  @Get("exchange")
  @HttpCode(HttpStatus.OK)
  async exchangeRelay(@Query("token") token?: string) {
    if (!token || token.length !== 64) {
      throw new BadRequestException(
        "Invalid relay token format (expected 64-char hex)",
      );
    }

    let payload: { userId: string; accessToken: string };
    try {
      payload = await this.sso.exchangeRelayToken(token);
    } catch {
      throw new UnauthorizedException(
        "SSO relay token is invalid or has expired",
      );
    }

    const jwtPayload = await this.auth.verifyAccessToken(payload.accessToken);
    if (!jwtPayload)
      throw new UnauthorizedException("Associated JWT has expired");

    const user = await this.auth.validatePayload(jwtPayload).catch(() => null);
    if (!user)
      throw new UnauthorizedException("User not found or account inactive");

    return {
      accessToken: payload.accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        ecosystemRole: user.ecosystemRole,
        permissions: user.permissions,
      },
      expiresIn: 900,
    };
  }

  /**
   * GET /sso/validate
   * Bearer JWT — cross-domain liveness check.
   */
  @Get("validate")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  validateSession(@CurrentUser() user: JwtPayload) {
    return {
      valid: true,
      user: {
        id: user.sub,
        email: user.email,
        role: user.role,
        ecosystemRole: user.ecosystemRole,
        permissions: user.permissions,
      },
    };
  }

  /**
   * POST /sso/logout-all
   * Undocumented in the spec table but kept — clears Hub cookies and
   * revokes all refresh-token families unconditionally for the
   * authenticated user (fixes the previous cookie-presence-gated bug).
   */
  @Post("logout-all")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(user.sub);
    this.sso.clearSsoCookie(res);

    const scheme = process.env["NODE_ENV"] === "production" ? "https" : "http";
    const externalLogoutUrls = Array.from(EXTERNAL_PILLAR_DOMAINS).map(
      (domain) => `${scheme}://${domain}/api/auth/logout`,
    );

    return { success: true, externalLogoutUrls };
  }
}
