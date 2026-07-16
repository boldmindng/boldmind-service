import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import { ReferralService } from "./referral.service";
import { UpdateUserDto, UpdateProfileDto, UserQueryDto } from "./user.dto";

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly referralService: ReferralService,
  ) {}

  async findById(id: string) {
    return this.redis.withCache(
      `user:${id}`,
      () =>
        this.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            avatar: true,
            role: true,
            ecosystemRole: true,
            isVerified: true,
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            createdAt: true,
            lastLoginAt: true,
            profile: true,
            _count: { select: { subscriptions: true } },
          },
        }),
      120, // 2 min cache
    );
  }

  async findAll(query: UserQueryDto) {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    }
    // UserRole enum values are lowercase snake_case ('admin',
    // 'super_admin', 'business_owner', ...) — the original .toUpperCase()
    // here would have silently zeroed out every admin role-filter query.
    if (role) where.role = role.toLowerCase();

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { subscriptions: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * NOTE: this is wired up as the admin "update user" endpoint
   * (PATCH /users/:id, role/isActive/isBanned/banReason per its
   * @ApiOperation summary in the controller) but as written only allows
   * a user to update themselves, and UpdateUserDto doesn't expose
   * role/isActive/isBanned/banReason at all. That combination means the
   * admin route can never actually be used by an admin on someone else.
   * Left as-is pending a decision on the intended admin semantics —
   * flagging rather than guessing at a fix here.
   */
  async updateUser(id: string, actorId: string, dto: UpdateUserDto) {
    if (id !== actorId)
      throw new ForbiddenException("Cannot update another user");
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, name: true, avatar: true, phone: true },
    });
    await this.redis.del(`user:${id}`);
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: { ...dto },
      create: { userId, ...dto },
    });
    await this.redis.del(`user:${userId}`);
    await this.redis.del(`user:dashboard:${userId}`);
    return profile;
  }

  async getUserDashboard(userId: string) {
    return this.redis.withCache(
      `user:dashboard:${userId}`,
      async () => {
        const [user, subscriptions, recentActivity] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              profile: true,
            },
          }),
          this.prisma.subscription.findMany({
            where: { userId, status: { in: ["TRIAL", "ACTIVE"] } },
            select: {
              productSlug: true,
              status: true,
              currentPeriodEnd: true,
              tier: true,
              planCode: true,
            },
          }),
          this.prisma.activityLog.findMany({
            where: { userId },
            take: 10,
            orderBy: { createdAt: "desc" },
            select: { action: true, resource: true, createdAt: true },
          }),
        ]);
        return { user, subscriptions, recentActivity };
      },
      60,
    );
  }

  async banUser(targetId: string, reason: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: true, banReason: reason, isActive: false },
    });
    await this.prisma.adminLog.create({
      data: {
        adminId: actorId,
        targetId,
        targetType: "users",
        action: "BAN_USER",
        reason,
      },
    });
    await this.redis.del(`user:${targetId}`);
    this.logger.warn(`User ${targetId} banned by ${actorId}: ${reason}`);
  }

  async unbanUser(targetId: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: false, banReason: null, isActive: true },
    });
    await this.prisma.adminLog.create({
      data: {
        adminId: actorId,
        targetId,
        targetType: "users",
        action: "UNBAN_USER",
      },
    });
    await this.redis.del(`user:${targetId}`);
  }

  async deleteUser(targetId: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive: false, email: `deleted_${targetId}@boldmind.ng` },
    });
    await this.redis.del(`user:${targetId}`);
    this.logger.warn(`User ${targetId} soft-deleted by ${actorId}`);
  }

  /**
   * Admin: full subscription history for a user (not restricted to
   * active/trial, unlike getUserProducts).
   */
  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getActivityLog(
    userId: string,
    page = 1,
    limit = 20,
    productSlug?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: any = { userId };
    if (productSlug) where.productSlug = productSlug;

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUserProducts(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
      select: {
        productSlug: true,
        tier: true,
        status: true,
        currentPeriodEnd: true,
        planCode: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async completeOnboarding(userId: string, dto: any) {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        onboardingDone: true,
        ...(dto.preferences ? { activeProducts: dto.preferences } : {}),
      },
      create: {
        userId,
        onboardingDone: true,
        activeProducts: dto.preferences ?? [],
        referralCode: await this.referralService.generateUniqueCode(),
      },
    });

    if (dto.role || dto.digitalMaturity) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.role ? { ecosystemRole: dto.role as any } : {}),
          ...(dto.digitalMaturity
            ? { digitalMaturity: dto.digitalMaturity as any }
            : {}),
        },
      });
      await this.redis.del(`user:${userId}`);
    }

    return { onboardingDone: true, profile };
  }

  // ---------------------------------------------------------------------
  // /users/me
  // ---------------------------------------------------------------------

  async updateMe(
    userId: string,
    dto: { name?: string; phone?: string; ecosystemRole?: string },
  ) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.ecosystemRole !== undefined)
      data.ecosystemRole = dto.ecosystemRole as any;

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("No updatable fields provided");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, phone: true, ecosystemRole: true },
    });
    await this.redis.del(`user:${userId}`);
    await this.redis.del(`user:dashboard:${userId}`);
    return user;
  }

  async getProfile(userId: string) {
    // A profile may not exist yet if the user hasn't onboarded — return
    // null rather than 404 so the client can drive them into onboarding.
    return this.prisma.userProfile.findUnique({ where: { userId } });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    if (!avatarUrl?.trim()) {
      throw new BadRequestException("avatarUrl is required");
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: { id: true, avatar: true },
    });
    await this.redis.del(`user:${userId}`);
    return user;
  }

  async getNotifications(
    userId: string,
    page = 1,
    pageSize = 20,
    read?: boolean,
  ) {
    const skip = (page - 1) * pageSize;
    const where: any = { userId };
    if (read !== undefined) where.read = read;

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        unreadCount,
      },
    };
  }

  async markAllNotificationsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException("Notification not found");
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
  }

  /**
   * Self-service account deletion. Requires the caller to re-type their
   * email as a lightweight confirmation, flags the account inactive
   * immediately, and logs an ERASURE_REQUESTED AdminLog entry as the
   * system of record for a background job to pick up.
   *
   * NOTE: there's no dedicated erasure/deletion-request table in the
   * current schema. AdminLog is the closest existing audit trail, so
   * that's what this uses for now — but a background job polling
   * `AdminLog.action = 'ERASURE_REQUESTED'` to actually anonymize the
   * user after the NDPA window is a separate piece of work this method
   * doesn't do. If erasure requests need their own status/lifecycle
   * (e.g. cancellable, visible to the user), a real table is worth
   * adding.
   */
  async requestErasure(userId: string, confirmEmail: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    if (
      !confirmEmail ||
      confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()
    ) {
      throw new BadRequestException(
        "Email confirmation does not match your account email",
      );
    }

    const activeSubscriptions = await this.prisma.subscription.count({
      where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    await this.prisma.adminLog.create({
      data: {
        adminId: userId,
        targetId: userId,
        targetType: "users",
        action: "ERASURE_REQUESTED",
        reason: "Self-service NDPA erasure request",
        metadata: { confirmedEmail: user.email, activeSubscriptions },
      },
    });

    await this.redis.del(`user:${userId}`);
    await this.redis.del(`user:dashboard:${userId}`);

    this.logger.warn(
      `Erasure requested for user ${userId} (NDPA) — queued for processing`,
    );

    return {
      status: "PENDING",
      message:
        "Your erasure request has been received and will be processed within 30 days in accordance with the NDPA.",
      ...(activeSubscriptions > 0 && {
        warning:
          "You have active subscriptions. These will be cancelled as part of erasure.",
      }),
    };
  }
}
