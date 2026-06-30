 
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
  ChangePasswordDto,
} from './dto/auth.dto';
import {
  UserRole,
  EcosystemRole,
  AuthProvider,
  SYSTEM_ROLE_PERMISSIONS,
  ECOSYSTEM_ROLE_PERMISSIONS,
  getRolePermissions,
} from '@boldmindng/utils';
import { Resend } from 'resend';

const SALT_ROUNDS = 12;
const OTP_TTL_SECS = 600; // 10 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECS = 900; // 15 minutes
 
export interface JwtPayload {
  sub: string;         // userId
  email: string;
  role: UserRole;
  ecosystemRole?: EcosystemRole;
  permissions: string[];
  iat?: number;
  exp?: number;
}
 
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
 
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private resend: Resend | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private getResend(): Resend | null {
    if (this.resend) return this.resend;
    const key = this.config.get<string>('RESEND_API_KEY');
    if (!key) return null;
    this.resend = new Resend(key);
    return this.resend;
  }
 
  // ──────────────────────────────────────────
  // REGISTER
  // ──────────────────────────────────────────
 
  async register(dto: RegisterDto, ipAddress?: string): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
 
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
 
    // Determine initial role: founders/creators get ecosystem role, default to guest
    const role: UserRole = (dto.ecosystemRole as UserRole) ?? 'guest';
    const permissions = getRolePermissions(role as never);
 
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        role,
        ecosystemRole: dto.ecosystemRole as EcosystemRole | undefined,
        provider: 'email' as AuthProvider,
        permissions,
        profile: {
          create: {
            displayName: dto.name,
            referralCode: crypto.randomBytes(6).toString('hex'),
            referredBy: dto.referralCode,
          },
        },
        studyStreak: dto.ecosystemRole === 'student' ? { create: {} } : undefined,
      },
    });
 
    // Queue OTP email verification
    await this.sendEmailOtp(user.id, user.email, 'email_verify');

    // Send welcome email (fire and forget)
    const resend = this.getResend();
    if (resend) {
      resend.emails.send({
        from: 'BoldMind <noreply@boldmind.ng>',
        to: user.email,
        subject: 'Welcome to BoldMind! 🚀',
        text: `Welcome ${dto.name}!\n\nYour BoldMind account is ready. Please verify your email using the OTP we just sent you to get started.\n\nBoldMind Team`,
      }).catch(err => this.logger.error(`Welcome email failed: ${err.message}`));
    }

    // Log activity
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: 'register', ipAddress, metadata: { role } },
    });
 
    return this.issueTokenPair(user.id, user.email, user.role as unknown as UserRole, user.ecosystemRole as EcosystemRole | undefined, permissions);
  }
 
  // ──────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────
 
  async login(dto: LoginDto, ipAddress?: string): Promise<TokenPair> {
    const lockKey = `auth:lock:${dto.email.toLowerCase()}`;
    const attemptKey = `auth:attempts:${dto.email.toLowerCase()}`;
 
    // Check lockout
    const isLocked = await this.redis.get(lockKey);
    if (isLocked) {
      throw new ForbiddenException('Account temporarily locked due to too many failed attempts. Try again in 15 minutes.');
    }
 
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true, email: true, passwordHash: true, role: true,
        ecosystemRole: true, permissions: true, isActive: true, isVerified: true,
      },
    });
 
    if (!user || !user.passwordHash) {
      await this.trackFailedAttempt(attemptKey, lockKey);
      throw new UnauthorizedException('Invalid email or password');
    }
 
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
    }
 
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.trackFailedAttempt(attemptKey, lockKey);
      throw new UnauthorizedException('Invalid email or password');
    }
 
    // Clear failed attempts on success
    await this.redis.del(attemptKey);
 
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });
 
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: 'login', ipAddress },
    });
 
    return this.issueTokenPair(
      user.id, user.email, user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
    );
  }

  // ──────────────────────────────────────────
  // OAUTH (Google, GitHub, Twitter, Facebook)
  // ──────────────────────────────────────────
 
  async handleOAuthLogin(params: {
    providerId: string;
    provider: AuthProvider;
    email: string;
    name: string;
    avatar?: string;
    ipAddress?: string;
  }): Promise<TokenPair> {
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ provider: params.provider, providerId: params.providerId }, { email: params.email.toLowerCase() }] },
    });
 
    if (!user) {
      // New OAuth user — create with guest role initially
      user = await this.prisma.user.create({
        data: {
          email: params.email.toLowerCase(),
          name: params.name,
          avatar: params.avatar,
          provider: params.provider,
          providerId: params.providerId,
          role: 'guest' as UserRole,
          isVerified: true, // OAuth emails are pre-verified
          emailVerifiedAt: new Date(),
          permissions: [],
          profile: {
            create: {
              displayName: params.name,
              avatarUrl: params.avatar,
              referralCode: crypto.randomBytes(6).toString('hex'),
            },
          },
        },
      });
    } else {
      // Existing user — update OAuth credentials if needed
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          providerId: params.providerId,
          avatar: params.avatar ?? user.avatar,
          lastLoginAt: new Date(),
          lastLoginIp: params.ipAddress,
          isVerified: true,
        },
      });
    }
 
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: `oauth_login:${params.provider}`, ipAddress: params.ipAddress },
    });
 
    return this.issueTokenPair(
      user.id, user.email, user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
    );
  }

  // ──────────────────────────────────────────
  // REFRESH TOKEN
  // ──────────────────────────────────────────
 
  async refreshToken(dto: RefreshTokenDto): Promise<TokenPair> {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: dto.refreshToken } });
 
    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      // Token reuse detected — revoke entire family
      if (stored) {
        await this.prisma.refreshToken.updateMany({
          where: { family: stored.family },
          data: { isRevoked: true },
        });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
 
    // Rotate: revoke old, issue new in same family
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });
 
    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: { id: true, email: true, role: true, ecosystemRole: true, permissions: true, isActive: true },
    });
 
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }
 
    return this.issueTokenPair(
      user.id, user.email, user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
      stored.family,
    );
  }
 
  // ──────────────────────────────────────────
  // VERIFY OTP
  // ──────────────────────────────────────────
 
  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const otp = await this.prisma.oTPVerification.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        purpose: dto.purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
 
    if (!otp) throw new BadRequestException('OTP is invalid or has expired');
 
    if (otp.attempts >= 3) throw new ForbiddenException('Too many OTP attempts');
 
    const isValid = await bcrypt.compare(dto.code, otp.code);
    if (!isValid) {
      await this.prisma.oTPVerification.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect OTP code');
    }
 
    await this.prisma.oTPVerification.update({ where: { id: otp.id }, data: { isUsed: true } });
 
    if (dto.purpose === 'email_verify' && otp.userId) {
      await this.prisma.user.update({
        where: { id: otp.userId },
        data: { isVerified: true, emailVerifiedAt: new Date() },
      });
    }
 
    return { verified: true };
  }
 
  // ──────────────────────────────────────────
  // FORGOT / RESET PASSWORD
  // ──────────────────────────────────────────
 
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Always return success to prevent email enumeration
    if (!user) return;
 
    await this.sendEmailOtp(user.id, user.email, 'password_reset');
  }
 
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    await this.verifyOtp({ email: dto.email, code: dto.code, purpose: 'password_reset' });
 
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { email: dto.email.toLowerCase() },
      data: { passwordHash },
    });
 
    // Revoke all existing refresh tokens
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (user) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      });
    }
  }
 
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user?.passwordHash) throw new BadRequestException('No password set (OAuth account)');
 
    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');
 
    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }
 
  // ──────────────────────────────────────────
  // GET ME
  // ──────────────────────────────────────────
 
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true, ecosystemRole: true,
        digitalMaturity: true, permissions: true, isVerified: true, avatar: true,
        createdAt: true, lastLoginAt: true,
        profile: {
          select: {
            displayName: true, bio: true, avatarUrl: true, state: true,
            prefersPidgin: true, dyslexiaMode: true, activeProducts: true,
            onboardingDone: true, referralCode: true, examTarget: true,
          },
        },
        subscriptions: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { productSlug: true, tier: true, currentPeriodEnd: true },
        },
      },
    });
 
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
 
  // ──────────────────────────────────────────
  // ROLE MANAGEMENT (admin only)
  // ──────────────────────────────────────────
 
  async updateUserRole(targetUserId: string, newRole: UserRole, adminId: string): Promise<void> {
    const permissions = getRolePermissions(newRole as never);
 
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole as never, permissions },
    });
 
    await this.prisma.adminLog.create({
      data: {
        adminId,
        action: 'update_user_role',
        targetType: 'user',
        targetId: targetUserId,
        metadata: { newRole },
      },
    });
  }
 
  // ──────────────────────────────────────────
  // LOGOUT
  // ──────────────────────────────────────────
 
  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { isRevoked: true },
    });
  }
 
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }
 
  // ──────────────────────────────────────────
  // VALIDATE JWT PAYLOAD (used by JwtStrategy)
  // ──────────────────────────────────────────
 
  async validatePayload(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, ecosystemRole: true, permissions: true, isActive: true },
    });
 
    if (!user || !user.isActive) throw new UnauthorizedException('Token is no longer valid');
    // Expose `sub` so @CurrentUser() behaves the same as the raw JwtPayload
    return { ...user, sub: user.id };
  }

     async verifyAccessToken(token: string): Promise<JwtPayload | null> {
        try {
          return await this.jwtService.verifyAsync<JwtPayload>(token);
        } catch {
          return null;
        }
      }
 
  // ──────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────
 
  private async issueTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    ecosystemRole: EcosystemRole | undefined,
    permissions: string[],
    existingFamily?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, role, ecosystemRole, permissions };
 
    const accessToken = this.jwtService.sign(payload);
 
    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const family = existingFamily ?? crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
 
    await this.prisma.refreshToken.create({
      data: { userId, token: rawRefreshToken, family, expiresAt },
    });
 
    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }
 
  private async sendEmailOtp(userId: string, email: string, purpose: string): Promise<void> {
    // Expire old OTPs for this email/purpose
    await this.prisma.oTPVerification.updateMany({
      where: { email, purpose, isUsed: false },
      data: { isUsed: true },
    });
 
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
    const hashedCode = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECS * 1000);
 
    await this.prisma.oTPVerification.create({
      data: { userId, email, code: hashedCode, purpose, expiresAt },
    });

    this.logger.log(`OTP for ${email} [${purpose}]: ${rawCode}`);

    const resend = this.getResend();
    if (resend) {
      const subject = purpose === 'email_verify'
        ? 'Verify your BoldMind email'
        : 'Reset your BoldMind password';
      const text = purpose === 'email_verify'
        ? `Your BoldMind email verification code is:\n\n${rawCode}\n\nThis code expires in 10 minutes.`
        : `Your BoldMind password reset code is:\n\n${rawCode}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`;
      resend.emails.send({
        from: 'BoldMind <noreply@boldmind.ng>',
        to: email,
        subject,
        text,
      }).catch(err => this.logger.error(`Email send failed [${purpose}]: ${err.message}`));
    }
  }
 
  private async trackFailedAttempt(attemptKey: string, lockKey: string): Promise<void> {
    const attempts = await this.redis.incr(attemptKey);
    await this.redis.expire(attemptKey, LOCKOUT_DURATION_SECS);
 
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await this.redis.setex(lockKey, LOCKOUT_DURATION_SECS, '1');
    }
  }
}