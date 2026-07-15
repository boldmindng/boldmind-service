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
  Ip,
  Patch,
  Param,
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthGuard } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";
import { SsoService, SSO_REFRESH_COOKIE_NAME } from "./sso/sso.service";
import { JwtAuthGuard } from "./auth.guard";
import { RolesGuard } from "./roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/user.decorator";
import { JwtPayload } from "./auth.service";
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateRoleDto,
  VerifyEmailDto,
  SendPhoneOtpDto,
  VerifyPhoneDto,
  Enable2faDto,
  Verify2faDto,
  Login2faDto,
} from "./dto/auth.dto";

@Injectable()
class GoogleAuthGuard extends AuthGuard("google") {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const redirect = (req.query["redirect"] || req.query["return_url"]) as
      | string
      | undefined;
    if (redirect) {
      res.cookie("oauth_redirect", redirect, {
        maxAge: 5 * 60 * 1000,
        httpOnly: false,
        sameSite: "lax",
        path: "/",
      });
    }
    return super.canActivate(context);
  }
}

@Controller("auth")
export class AuthController {
  private readonly hubUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly configService: ConfigService,
  ) {
    this.hubUrl = this.configService.get<string>(
      "HUB_URL",
      "https://boldmind.ng",
    );
  }

  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto, ip);
    this.ssoService.setSsoCookie(res, result.accessToken);
    this.ssoService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, ip);
    if ("requires2fa" in result) return result; // { requires2fa: true, pendingToken } — no cookies set yet

    this.ssoService.setSsoCookie(res, result.accessToken);
    this.ssoService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("login/verify-2fa")
  @HttpCode(HttpStatus.OK)
  async loginVerify2fa(
    @Body() dto: Login2faDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completeLogin2fa(
      dto.pendingToken,
      dto.code,
    );
    this.ssoService.setSsoCookie(res, result.accessToken);
    this.ssoService.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      dto.refreshToken ??
      (req.cookies?.[SSO_REFRESH_COOKIE_NAME] as string | undefined);
    if (!refreshToken)
      throw new UnauthorizedException("Refresh token required");

    const tokens = await this.authService.refreshToken({ refreshToken });
    this.ssoService.setSsoCookie(res, tokens.accessToken);
    this.ssoService.setRefreshCookie(res, tokens.refreshToken);
    return tokens; // { accessToken, refreshToken, expiresIn } — no `user` per spec
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken =
      dto.refreshToken ??
      (req.cookies?.[SSO_REFRESH_COOKIE_NAME] as string | undefined);
    if (refreshToken) await this.authService.logout(refreshToken);
    this.ssoService.clearSsoCookie(res);
    this.ssoService.clearRefreshCookie(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(user.sub);
    this.ssoService.clearSsoCookie(res);
    this.ssoService.clearRefreshCookie(res);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyOtp({
      email: user.email,
      code: dto.code,
      purpose: "email_verify",
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post("send-phone-otp")
  @HttpCode(HttpStatus.OK)
  sendPhoneOtp(@CurrentUser() user: JwtPayload, @Body() dto: SendPhoneOtpDto) {
    return this.authService.sendPhoneOtp(user.sub, dto.phone);
  }

  @UseGuards(JwtAuthGuard)
  @Post("verify-phone")
  @HttpCode(HttpStatus.OK)
  verifyPhone(@CurrentUser() user: JwtPayload, @Body() dto: VerifyPhoneDto) {
    return this.authService.verifyPhoneOtp(user.sub, dto.phone, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post("enable-2fa")
  @HttpCode(HttpStatus.OK)
  enable2fa(@CurrentUser() user: JwtPayload, @Body() _dto: Enable2faDto) {
    return this.authService.enable2fa(user.sub, user.email);
  }

  @UseGuards(JwtAuthGuard)
  @Post("verify-2fa")
  @HttpCode(HttpStatus.OK)
  verify2fa(@CurrentUser() user: JwtPayload, @Body() dto: Verify2faDto) {
    return this.authService.verify2fa(user.sub, dto.code);
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("change-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }

  // ── OAuth — Google ──────────────────────────────────────────────────────────
  // ── OAuth — Google ──────────────────────────────────────────────────────────
  // Patch for src/modules/auth/auth.controller.ts

  @Get("google")
  @UseGuards(GoogleAuthGuard)
  googleAuth() {}

  @Get("google/callback")
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const oauthResult = req.user as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      redirectUrl?: string;
      userId?: string;
      user?: { id: string; [key: string]: unknown };
    };

    const { accessToken, refreshToken, redirectUrl } = oauthResult;

    // BUG FIX: previous version destructured `userId` directly, but
    // AuthService.handleOAuthLogin() (like login()/register()) returns the
    // user nested as `{ user: { id, ... } }`, not a top-level `userId`. That
    // made every cross-domain (external pillar) Google sign-in silently store
    // a relay token with userId=undefined (JSON.stringify drops undefined
    // keys), breaking the downstream exchange for amebogist.ng /
    // educenter.com.ng / villagecircle.ng. Resolve defensively so this works
    // regardless of which shape handleOAuthLogin ends up returning.
    const userId = oauthResult.userId ?? oauthResult.user?.id;

    if (!accessToken || !refreshToken || !userId) {
      // this.logger.error(
      //   `Google OAuth callback missing required fields — accessToken=${!!accessToken} refreshToken=${!!refreshToken} userId=${!!userId}. ` +
      //     "Check AuthService.handleOAuthLogin() return shape matches what GoogleStrategy/AuthController expect.",
      // );
      return res.redirect(`${this.hubUrl}/login?error=oauth_failed`);
    }

    this.ssoService.setSsoCookie(res, accessToken);

    // BUG FIX: this was never called on the Google OAuth path, unlike every
    // other auth flow (register/login/login-verify-2fa/refresh all set both
    // cookies). Without it, Google sign-ins had no refresh token anywhere —
    // the access token cookie (15 min TTL) would expire with no way to
    // silently refresh, logging the user out shortly after landing on the
    // dashboard.
    this.ssoService.setRefreshCookie(res, refreshToken);

    res.clearCookie("oauth_redirect", { path: "/" });

    const returnUrl = redirectUrl || `${this.hubUrl}/dashboard`;

    if (this.ssoService.isExternalDomain(returnUrl)) {
      const relayToken = await this.ssoService.createRelayToken(
        userId,
        accessToken,
      );
      const relayUrl = this.ssoService.buildCrossDomainUrl(
        returnUrl,
        relayToken,
      );
      return res.redirect(relayUrl);
    }

    return res.redirect(this.ssoService.safeRedirectUrl(returnUrl));
  }

  // ── Admin: Role Management ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin", "super_admin")
  @Patch("users/:id/role")
  updateRole(
    @Param("id") userId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.authService.updateUserRole(
      userId,
      dto.role as never,
      admin.sub,
    );
  }
}
