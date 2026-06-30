import {
  Controller, Post, Get, Body, Req, Res, UseGuards,
  HttpCode, HttpStatus, Ip, Patch, Param, Injectable, ExecutionContext,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SsoService } from './sso/sso.service';
import { JwtAuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtPayload } from './auth.service';
import {
  RegisterDto, LoginDto, RefreshTokenDto, ForgotPasswordDto,
  ResetPasswordDto, VerifyOtpDto, ChangePasswordDto, UpdateRoleDto,
} from './dto/auth.dto';

/**
 * Custom Google OAuth guard.
 * Before Passport redirects to Google, we store the desired post-login
 * redirect URL in a short-lived cookie so it survives the OAuth round-trip.
 */
@Injectable()
class GoogleAuthGuard extends AuthGuard('google') {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const redirect = (req.query['redirect'] || req.query['return_url']) as string | undefined;
    if (redirect) {
      res.cookie('oauth_redirect', redirect, {
        maxAge: 5 * 60 * 1000, // 5 minutes — enough to survive the round-trip
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
      });
    }
    return super.canActivate(context);
  }
}

@Controller('auth')
export class AuthController {
  private readonly hubUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly ssoService: SsoService,
    private readonly configService: ConfigService,
  ) {
    this.hubUrl = this.configService.get<string>('HUB_URL', 'https://boldmind.ng');
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.register(dto, ip);
    this.ssoService.setSsoCookie(res, tokens.accessToken);
    return tokens;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto, ip);
    this.ssoService.setSsoCookie(res, tokens.accessToken);
    return tokens;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(dto.refreshToken);
    this.ssoService.clearSsoCookie(res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.sub);
    this.ssoService.clearSsoCookie(res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp({ ...dto, purpose: 'email_verify' });
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.sub, dto);
  }

  // ── OAuth — Google ──────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const {
      accessToken,
      redirectUrl,
      user,
    } = req.user as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      redirectUrl?: string;
      user: { id: string };
    };

    // Set SSO cookie
    this.ssoService.setSsoCookie(res, accessToken);

    // Cleanup temp cookie
    res.clearCookie('oauth_redirect', {
      path: '/',
    });

    const returnUrl = redirectUrl || `${this.hubUrl}/dashboard`;

    // Cross-domain redirect
    if (this.ssoService.isExternalDomain(returnUrl)) {
      // FIXED: previously called createRelayToken() a second time with
      // (returnUrl, relayToken) — that does not match the method's
      // (userId, accessToken) signature and produced a malformed relay
      // entry + URL. Create the token once, then build the URL with it.
      const relayToken = await this.ssoService.createRelayToken(user.id, accessToken);
      const relayUrl = this.ssoService.buildCrossDomainUrl(returnUrl, relayToken);

      return res.redirect(relayUrl);
    }

    // Same-domain redirect
    return res.redirect(
      this.ssoService.safeRedirectUrl(returnUrl),
    );
  }
  // ── Admin: Role Management ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @Patch('users/:id/role')
  updateRole(
    @Param('id') userId: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: JwtPayload,
  ) {
    return this.authService.updateUserRole(userId, dto.role as never, admin.sub);
  }
}