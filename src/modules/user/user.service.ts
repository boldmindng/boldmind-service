import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { UpdateUserDto, UpdateProfileDto, UserQueryDto } from './user.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findById(id: string) {
    return this.redis.withCache(
      `user:${id}`,
      () => this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true, email: true, name: true, phone: true, avatar: true,
          role: true, ecosystemRole: true, isVerified: true, emailVerifiedAt: true, phoneVerifiedAt: true,
          createdAt: true, lastLoginAt: true,
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
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (role) where.role = role.toUpperCase();

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, role: true,
          isActive: true, createdAt: true, lastLoginAt: true,
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

  async updateUser(id: string, actorId: string, dto: UpdateUserDto) {
    if (id !== actorId) throw new ForbiddenException('Cannot update another user');
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
    return profile;
  }

  async getUserDashboard(userId: string) {
    return this.redis.withCache(
      `user:dashboard:${userId}`,
      async () => {
        const [user, subscriptions, recentActivity] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, email: true, role: true, profile: true },
          }),
          this.prisma.subscription.findMany({
            where: { userId, status: { in: ['TRIAL', 'ACTIVE'] } },
            select: { productSlug: true, status: true, currentPeriodEnd: true, tier: true, planCode: true },
          }),
          this.prisma.activityLog.findMany({
            where: { userId },
            take: 10,
            orderBy: { createdAt: 'desc' },
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
      data: { isActive: false },
    });
    await this.prisma.adminLog.create({
      data: { adminId: actorId, targetId, targetType: 'users', action: 'BAN_USER', reason },
    });
    await this.redis.del(`user:${targetId}`);
    this.logger.warn(`User ${targetId} banned by ${actorId}: ${reason}`);
  }

  async unbanUser(targetId: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive: true },
    });
    await this.prisma.adminLog.create({
      data: { adminId: actorId, targetId, targetType: 'users', action: 'UNBAN_USER' },
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

  async getActivityLog(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where: { userId } }),
    ]);
    return { data: logs, meta: { total, page, limit } };
  }

  async getUserProducts(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { productSlug: true, tier: true, status: true, currentPeriodEnd: true, planCode: true },
      orderBy: { createdAt: 'desc' },
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
        referralCode: require('crypto').randomBytes(6).toString('hex'),
      },
    });

    if (dto.role || dto.digitalMaturity) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(dto.role ? { ecosystemRole: dto.role as any } : {}),
          ...(dto.digitalMaturity ? { digitalMaturity: dto.digitalMaturity as any } : {}),
        },
      });
      await this.redis.del(`user:${userId}`);
    }

    return { onboardingDone: true, profile };
  }
}