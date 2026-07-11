import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import * as QRCode from "qrcode";
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyOtpDto,
  ChangePasswordDto,
} from "./dto/auth.dto";
import {
  UserRole,
  EcosystemRole,
  AuthProvider,
  getRolePermissions,
} from "@boldmindng/utils";
import { Resend } from "resend";
import { totp } from "./totp.util";

const SALT_ROUNDS = 12;
const OTP_TTL_SECS = 600; // 10 minutes
const PHONE_OTP_TTL_SECS = 900; // 15 minutes — matches system-design §3.1
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECS = 900; // 15 minutes
const TWOFA_PENDING_TTL_SECS = 600; // 10 minutes to confirm setup
const LOGIN_2FA_PENDING_TTL_SECS = 300; // 5 minutes to complete challenge

export type LoginResult =
  | AuthResult
  | { requires2fa: true; pendingToken: string };

export interface JwtPayload {
  sub: string;
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

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  ecosystemRole?: EcosystemRole;
  permissions: string[];
  isVerified: boolean;
}

export interface AuthResult extends TokenPair {
  user: SafeUser;
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
    const key = this.config.get<string>("RESEND_API_KEY");
    if (!key) return null;
    this.resend = new Resend(key);
    return this.resend;
  }

  private toSafeUser(u: {
    id: string;
    email: string;
    name: string;
    role: unknown;
    ecosystemRole?: unknown;
    permissions: string[];
    isVerified: boolean;
  }): SafeUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role as UserRole,
      ecosystemRole: u.ecosystemRole as EcosystemRole | undefined,
      permissions: u.permissions,
      isVerified: u.isVerified,
    };
  }

  // ──────────────────────────────────────────
  // REGISTER
  // ──────────────────────────────────────────

  async register(dto: RegisterDto, ipAddress?: string): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (phoneTaken)
        throw new ConflictException(
          "An account with this phone number already exists",
        );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const role: UserRole = (dto.ecosystemRole as UserRole) ?? "guest";
    const permissions = getRolePermissions(role as never);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        phone: dto.phone,
        passwordHash,
        role,
        ecosystemRole: dto.ecosystemRole as EcosystemRole | undefined,
        provider: "email" as AuthProvider,
        permissions,
        isVerified: false,
        profile: {
          create: {
            displayName: dto.name,
            referralCode: crypto.randomBytes(6).toString("hex"),
            referredBy: dto.referralCode,
          },
        },
        studyStreak:
          dto.ecosystemRole === "student" ? { create: {} } : undefined,
      },
    });

    await this.sendEmailOtp(user.id, user.email, "email_verify");

    const resend = this.getResend();
    if (resend) {
      resend.emails
        .send({
          from: "BoldMind <noreply@boldmind.ng>",
          to: user.email,
          subject: "Welcome to BoldMind! 🚀",
          text: `Welcome ${dto.name}!\n\nYour BoldMind account is ready. Please verify your email using the OTP we just sent you to get started.\n\nBoldMind Team`,
        })
        .catch((err) =>
          this.logger.error(`Welcome email failed: ${err.message}`),
        );
    }

    await this.prisma.activityLog.create({
      data: {
        userId: user.id,
        action: "register",
        ipAddress,
        metadata: { role },
      },
    });

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      role,
      user.ecosystemRole as EcosystemRole | undefined,
      permissions,
    );
    return {
      ...tokens,
      user: this.toSafeUser({ ...user, role, permissions, isVerified: false }),
    };
  }

  // ──────────────────────────────────────────
  // LOGIN
  // ──────────────────────────────────────────

  async login(dto: LoginDto, ipAddress?: string): Promise<LoginResult> {
    const lockKey = `auth:lock:${dto.email.toLowerCase()}`;
    const attemptKey = `auth:attempts:${dto.email.toLowerCase()}`;

    const isLocked = await this.redis.session.get(lockKey);
    if (isLocked) {
      throw new ForbiddenException(
        "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        ecosystemRole: true,
        permissions: true,
        isActive: true,
        isVerified: true,
        twoFactorEnabled: true,
      },
    });

    if (!user || !user.passwordHash) {
      await this.trackFailedAttempt(attemptKey, lockKey);
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!user.isActive)
      throw new ForbiddenException("This account has been deactivated");

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      await this.trackFailedAttempt(attemptKey, lockKey);
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.redis.session.del(attemptKey);

    // ── 2FA gate — password correct, but tokens withheld until TOTP confirmed ──
    if (user.twoFactorEnabled) {
      const pendingToken = crypto.randomBytes(32).toString("hex");
      await this.redis.session.setex(
        `2fa:login:${pendingToken}`,
        LOGIN_2FA_PENDING_TTL_SECS,
        JSON.stringify({ userId: user.id, ipAddress }),
      );
      return { requires2fa: true, pendingToken };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: "login", ipAddress },
    });

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
    );
    return { ...tokens, user: this.toSafeUser(user as any) };
  }

  async completeLogin2fa(
    pendingToken: string,
    code: string,
  ): Promise<AuthResult> {
    const key = `2fa:login:${pendingToken}`;
    const raw = await this.redis.session.get(key);
    if (!raw)
      throw new UnauthorizedException(
        "2FA challenge expired or invalid — please log in again",
      );

    const { userId, ipAddress } = JSON.parse(raw) as {
      userId: string;
      ipAddress?: string;
    };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        ecosystemRole: true,
        permissions: true,
        isActive: true,
        isVerified: true,
        twoFactorSecret: true,
      },
    });
    if (!user || !user.isActive || !user.twoFactorSecret) {
      throw new UnauthorizedException("2FA challenge invalid");
    }

    const isValid = totp.verify(code, user.twoFactorSecret);
    if (!isValid) throw new BadRequestException("Incorrect 2FA code");

    await this.redis.session.del(key); // one-time use

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ipAddress },
    });
    await this.prisma.activityLog.create({
      data: { userId: user.id, action: "login_2fa", ipAddress },
    });

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
    );
    return { ...tokens, user: this.toSafeUser(user as any) };
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
  }): Promise<TokenPair & { userId: string }> {
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { provider: params.provider, providerId: params.providerId },
          { email: params.email.toLowerCase() },
        ],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: params.email.toLowerCase(),
          name: params.name,
          avatar: params.avatar,
          provider: params.provider,
          providerId: params.providerId,
          role: "guest" as UserRole,
          isVerified: true,
          emailVerifiedAt: new Date(),
          permissions: [],
          profile: {
            create: {
              displayName: params.name,
              avatarUrl: params.avatar,
              referralCode: crypto.randomBytes(6).toString("hex"),
            },
          },
        },
      });
    } else {
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
      data: {
        userId: user.id,
        action: `oauth_login:${params.provider}`,
        ipAddress: params.ipAddress,
      },
    });

    const tokens = await this.issueTokenPair(
      user.id,
      user.email,
      user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
    );
    return { ...tokens, userId: user.id };
  }

  // ──────────────────────────────────────────
  // REFRESH TOKEN
  // ──────────────────────────────────────────

  async refreshToken(dto: RefreshTokenDto): Promise<TokenPair> {
    if (!dto.refreshToken)
      throw new UnauthorizedException("Refresh token required");

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: dto.refreshToken },
    });

    if (!stored || stored.isRevoked || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.updateMany({
          where: { family: stored.family },
          data: { isRevoked: true },
        });
      }
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { isRevoked: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: {
        id: true,
        email: true,
        role: true,
        ecosystemRole: true,
        permissions: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or deactivated");
    }

    return this.issueTokenPair(
      user.id,
      user.email,
      user.role as unknown as UserRole,
      user.ecosystemRole as EcosystemRole | undefined,
      user.permissions,
      stored.family,
    );
  }

  // ──────────────────────────────────────────
  // VERIFY OTP (email)
  // ──────────────────────────────────────────

  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const otp = await this.prisma.oTPVerification.findFirst({
      where: {
        email: dto.email.toLowerCase(),
        purpose: dto.purpose,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) throw new BadRequestException("OTP is invalid or has expired");
    if (otp.attempts >= 3)
      throw new ForbiddenException("Too many OTP attempts");

    const isValid = await bcrypt.compare(dto.code, otp.code);
    if (!isValid) {
      await this.prisma.oTPVerification.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException("Incorrect OTP code");
    }

    await this.prisma.oTPVerification.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });

    if (dto.purpose === "email_verify" && otp.userId) {
      await this.prisma.user.update({
        where: { id: otp.userId },
        data: { isVerified: true, emailVerifiedAt: new Date() },
      });
    }

    return { verified: true };
  }

  // ──────────────────────────────────────────
  // PHONE OTP — Redis-backed (WhatsApp-first per §5; wire OTPService from
  // @boldmindng/sms here once NotificationModule is available to this module)
  // ──────────────────────────────────────────

  async sendPhoneOtp(
    userId: string,
    phone: string,
  ): Promise<{ sent: true; channel: "whatsapp" | "sms" }> {
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(rawCode, 10);
    const key = `otp:phone:${userId}`;

    await this.redis.session.setex(
      key,
      PHONE_OTP_TTL_SECS,
      JSON.stringify({ phone, code: hashedCode, attempts: 0 }),
    );

    this.logger.log(`Phone OTP for ${phone}: ${rawCode}`);
    // TODO: replace with @boldmindng/sms OTPService.send() once wired into AuthModule.
    // For now this only logs — no real delivery — flagging so it isn't mistaken for done.
    return { sent: true, channel: "sms" };
  }

  async verifyPhoneOtp(
    userId: string,
    phone: string,
    code: string,
  ): Promise<{ verified: boolean }> {
    const key = `otp:phone:${userId}`;
    const raw = await this.redis.session.get(key);
    if (!raw) throw new BadRequestException("OTP is invalid or has expired");

    const stored = JSON.parse(raw) as {
      phone: string;
      code: string;
      attempts: number;
    };
    if (stored.phone !== phone)
      throw new BadRequestException(
        "Phone number does not match pending verification",
      );
    if (stored.attempts >= 3) {
      await this.redis.session.del(key);
      throw new ForbiddenException("Too many OTP attempts");
    }

    const isValid = await bcrypt.compare(code, stored.code);
    if (!isValid) {
      stored.attempts += 1;
      await this.redis.session.setex(
        key,
        PHONE_OTP_TTL_SECS,
        JSON.stringify(stored),
      );
      throw new BadRequestException("Incorrect OTP code");
    }

    await this.redis.session.del(key);
    await this.prisma.user.update({
      where: { id: userId },
      data: { phone, isPhoneVerified: true },
    });

    return { verified: true };
  }

  // ──────────────────────────────────────────
  // 2FA (TOTP)
  // ──────────────────────────────────────────

  async enable2fa(
    userId: string,
    email: string,
  ): Promise<{ secret: string; qrCode: string }> {
    const secret = totp.generateSecret();
    const otpauthUrl = totp.keyUri(email, "BoldmindNG", secret);
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    await this.redis.session.setex(
      `2fa:pending:${userId}`,
      TWOFA_PENDING_TTL_SECS,
      secret,
    );
    return { secret, qrCode };
  }

  async verify2fa(userId: string, code: string): Promise<{ enabled: boolean }> {
    const secret = await this.redis.session.get(`2fa:pending:${userId}`);
    if (!secret)
      throw new BadRequestException(
        "No pending 2FA setup found — call /auth/enable-2fa first",
      );
    if (!totp.verify(code, secret))
      throw new BadRequestException("Incorrect 2FA code");

    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: true },
    });
    await this.redis.session.del(`2fa:pending:${userId}`);
    return { enabled: true };
  }

  // ──────────────────────────────────────────
  // FORGOT / RESET PASSWORD
  // ──────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ sent: true }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) return { sent: true }; // prevent email enumeration
    await this.sendEmailOtp(user.id, user.email, "password_reset");
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ success: true }> {
    await this.verifyOtp({
      email: dto.email,
      code: dto.code,
      purpose: "password_reset",
    });

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { email: dto.email.toLowerCase() },
      data: { passwordHash },
    });

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (user) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      });
    }
    return { success: true };
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash)
      throw new BadRequestException("No password set (OAuth account)");

    const isValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!isValid)
      throw new UnauthorizedException("Current password is incorrect");

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  // ──────────────────────────────────────────
  // GET ME
  // ──────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        ecosystemRole: true,
        digitalMaturity: true,
        permissions: true,
        isVerified: true,
        isPhoneVerified: true,
        twoFactorEnabled: true,
        avatar: true,
        createdAt: true,
        lastLoginAt: true,
        profile: {
          select: {
            displayName: true,
            bio: true,
            avatarUrl: true,
            state: true,
            prefersPidgin: true,
            dyslexiaMode: true,
            activeProducts: true,
            onboardingDone: true,
            referralCode: true,
            examTarget: true,
          },
        },
        subscriptions: {
          where: { status: { in: ["ACTIVE", "TRIAL"] } },
          select: { productSlug: true, tier: true, currentPeriodEnd: true },
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  // ──────────────────────────────────────────
  // ROLE MANAGEMENT (admin only)
  // ──────────────────────────────────────────

  async updateUserRole(
    targetUserId: string,
    newRole: UserRole,
    adminId: string,
  ): Promise<void> {
    const permissions = getRolePermissions(newRole as never);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole as never, permissions },
    });

    await this.prisma.adminLog.create({
      data: {
        adminId,
        action: "update_user_role",
        targetType: "user",
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
      select: {
        id: true,
        email: true,
        role: true,
        ecosystemRole: true,
        permissions: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive)
      throw new UnauthorizedException("Token is no longer valid");
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
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      ecosystemRole,
      permissions,
    };
    const accessToken = this.jwtService.sign(payload);

    const rawRefreshToken = crypto.randomBytes(64).toString("hex");
    const family = existingFamily ?? crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: { userId, token: rawRefreshToken, family, expiresAt },
    });

    return { accessToken, refreshToken: rawRefreshToken, expiresIn: 900 };
  }

  private async sendEmailOtp(
    userId: string,
    email: string,
    purpose: string,
  ): Promise<void> {
    await this.prisma.oTPVerification.updateMany({
      where: { email, purpose, isUsed: false },
      data: { isUsed: true },
    });

    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(rawCode, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECS * 1000);

    await this.prisma.oTPVerification.create({
      data: { userId, email, code: hashedCode, purpose, expiresAt },
    });

    this.logger.log(`OTP for ${email} [${purpose}]: ${rawCode}`);

    const resend = this.getResend();
    if (resend) {
      const subject =
        purpose === "email_verify"
          ? "Verify your BoldMind email"
          : "Reset your BoldMind password";
      const text =
        purpose === "email_verify"
          ? `Your BoldMind email verification code is:\n\n${rawCode}\n\nThis code expires in 10 minutes.`
          : `Your BoldMind password reset code is:\n\n${rawCode}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`;
      resend.emails
        .send({
          from: "BoldMind <noreply@boldmind.ng>",
          to: email,
          subject,
          text,
        })
        .catch((err) =>
          this.logger.error(`Email send failed [${purpose}]: ${err.message}`),
        );
    }
  }

  private async trackFailedAttempt(
    attemptKey: string,
    lockKey: string,
  ): Promise<void> {
    const attempts = await this.redis.session.incr(attemptKey);
    await this.redis.session.expire(attemptKey, LOCKOUT_DURATION_SECS);
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      await this.redis.session.setex(lockKey, LOCKOUT_DURATION_SECS, "1");
    }
  }
}
