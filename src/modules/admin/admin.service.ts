import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import { Post } from "../amebogist/schemas/post.schema";

export interface DashboardStats {
  users: {
    total: number;
    active: number;
    newThisMonth: number;
    newThisWeek: number;
    byRole: Record<string, number>;
  };
  revenue: {
    totalMRR: number; // Monthly Recurring Revenue in kobo
    totalAllTime: number;
    thisMonth: number;
    lastMonth: number;
    growth: number; // % growth MoM
    byProduct: { productSlug: string; revenue: number }[];
  };
  subscriptions: {
    total: number;
    active: number;
    trial: number;
    cancelled: number;
    byProduct: { productSlug: string; count: number }[];
  };
  content: {
    totalArticles: number;
    publishedArticles: number;
    totalViews: number;
  };
  products: {
    totalTransactions: number;
    waitlistEntries: number;
  };
  system: {
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    nodeVersion: string;
    timestamp: string;
  };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private static readonly DASHBOARD_CACHE_KEY = "admin:dashboard:stats";

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectModel(Post.name) private readonly postModel: Model<any>,
  ) {}

  async getDashboardStats(): Promise<DashboardStats> {
    return this.redis.withCache(
      AdminService.DASHBOARD_CACHE_KEY,
      async () => this.buildDashboardStats(),
      120, // 2 min cache
    );
  }

  private async buildDashboardStats(): Promise<DashboardStats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const [
      totalUsers,
      activeUsers,
      newThisMonth,
      newThisWeek,
      usersByRole,
      totalRevenue,
      monthRevenue,
      lastMonthRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfWeek } } }),
      this.prisma.user.groupBy({ by: ["role"], _count: { id: true } }),
      this.prisma.payment.aggregate({
        where: { status: "SUCCESS" },
        _sum: { amountNGN: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: "SUCCESS", paidAt: { gte: startOfMonth } },
        _sum: { amountNGN: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: "SUCCESS",
          paidAt: { gte: startOfLastMonth, lt: startOfMonth },
        },
        _sum: { amountNGN: true },
      }),
    ]);

    const [
      revenueByProduct,
      subscriptionStats,
      subscriptionsByProduct,
      totalArticles,
      publishedArticles,
      articleViews,
      totalTransactions,
      waitlistCount,
    ] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ["productSlug"],
        where: { status: "SUCCESS" },
        _sum: { amountNGN: true },
        orderBy: { _sum: { amountNGN: "desc" } },
        take: 10,
      }),
      this.prisma.subscription.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      this.prisma.subscription.groupBy({
        by: ["productSlug"],
        where: { status: { in: ["ACTIVE", "TRIAL"] } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      this.postModel.countDocuments(),
      this.postModel.countDocuments({ status: "PUBLISHED" }),
      this.postModel.aggregate([
        { $group: { _id: null, total: { $sum: "$views" } } },
      ]),
      this.prisma.payment.count({ where: { status: "SUCCESS" } }),
      this.prisma.waitlistEntry.count(),
    ]);

    const thisM = monthRevenue._sum.amountNGN || 0;
    const lastM = lastMonthRevenue._sum.amountNGN || 0;
    const growth = lastM > 0 ? Math.round(((thisM - lastM) / lastM) * 100) : 0;

    const subStatusMap = subscriptionStats.reduce((acc: any, s) => {
      acc[s.status] = s._count.id;
      return acc;
    }, {});

    const totalSubs = subscriptionStats.reduce(
      (sum, s) => sum + s._count.id,
      0,
    );

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        newThisMonth,
        newThisWeek,
        byRole: usersByRole.reduce((acc: any, r) => {
          acc[r.role] = r._count.id;
          return acc;
        }, {}),
      },
      revenue: {
        totalMRR: thisM,
        totalAllTime: totalRevenue._sum.amountNGN || 0,
        thisMonth: thisM,
        lastMonth: lastM,
        growth,
        byProduct: revenueByProduct.map((r) => ({
          productSlug: r.productSlug,
          revenue: r._sum.amountNGN || 0,
        })),
      },
      subscriptions: {
        total: totalSubs,
        active: subStatusMap["ACTIVE"] || 0,
        trial: subStatusMap["TRIAL"] || 0,
        cancelled: subStatusMap["CANCELLED"] || 0,
        byProduct: subscriptionsByProduct.map((s) => ({
          productSlug: s.productSlug,
          count: s._count.id,
        })),
      },
      content: {
        totalArticles,
        publishedArticles,
        totalViews: articleViews[0]?.total || 0,
      },
      products: {
        totalTransactions,
        waitlistEntries: waitlistCount,
      },
      system: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ── User management ───────────────────────────────────────

  async getFullUserList(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    isActive?: boolean;
    isBanned?: boolean;
    productSlug?: string;
  }) {
    const {
      page = 1,
      limit = 50,
      search,
      role,
      isActive,
      isBanned,
      productSlug,
    } = query;
    const where: any = {};
    if (search)
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ];
    // UserRole enum values are lowercase snake_case — normalize in case a
    // client sends 'Admin' / 'ADMIN'.
    if (role) where.role = role.toLowerCase();
    if (isActive !== undefined) where.isActive = isActive;
    if (isBanned !== undefined) where.isBanned = isBanned;
    if (productSlug) {
      where.subscriptions = {
        some: { productSlug, status: { in: ["ACTIVE", "TRIAL"] } },
      };
    }

    const skip = (page - 1) * limit;
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
          phone: true,
          isActive: true,
          isBanned: true,
          banReason: true,
          emailVerifiedAt: true,
          createdAt: true,
          lastLoginAt: true,
          _count: { select: { subscriptions: true, payments: true } },
          profile: { select: { displayName: true, state: true } },
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
   * Bans a user: flips isBanned/isActive and records the reason. Separate
   * from UserService's self-service deactivation logic (different module,
   * different call path — the admin route needs its own audit trail via
   * AdminLog, which UserService doesn't touch).
   */
  async banUser(targetId: string, reason: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: true, banReason: reason, isActive: false },
      select: {
        id: true,
        email: true,
        isBanned: true,
        banReason: true,
        isActive: true,
      },
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

    await Promise.all([
      this.redis.del(`user:${targetId}`),
      this.redis.del(AdminService.DASHBOARD_CACHE_KEY),
    ]);

    this.logger.warn(`User ${targetId} banned by ${actorId}: ${reason}`);
    return user;
  }

  async unbanUser(targetId: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: false, banReason: null, isActive: true },
      select: { id: true, email: true, isBanned: true, isActive: true },
    });

    await this.prisma.adminLog.create({
      data: {
        adminId: actorId,
        targetId,
        targetType: "users",
        action: "UNBAN_USER",
      },
    });

    await Promise.all([
      this.redis.del(`user:${targetId}`),
      this.redis.del(AdminService.DASHBOARD_CACHE_KEY),
    ]);

    return user;
  }

  async updateUserRole(targetId: string, newRole: string, actorId: string) {
    const user = await this.prisma.user.update({
      where: { id: targetId },
      data: { role: newRole.toLowerCase() as any },
      select: { id: true, email: true, role: true },
    });

    await this.prisma.adminLog.create({
      data: {
        adminId: actorId,
        targetId,
        action: "UPDATE_ROLE",
        targetType: "users",
        metadata: { newRole: newRole.toLowerCase() },
      },
    });

    await Promise.all([
      this.redis.del(`user:${targetId}`),
      this.redis.del(AdminService.DASHBOARD_CACHE_KEY),
    ]);
    return user;
  }

  // ── Wallet ────────────────────────────────────────────────

  /**
   * NOTE: POST /admin/wallet/lock only sends { userId, reason } — no
   * actorId — so unlike ban/unban/role-change this can't write an
   * AdminLog entry (there's no admin id to attach). If this needs to be
   * auditable the same way, add @CurrentUser("id") to that controller
   * route and thread it through here.
   */
  async lockWallet(userId: string, reason: string) {
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: { isLocked: true, lockReason: reason },
      create: { userId, isLocked: true, lockReason: reason },
    });
    this.logger.warn(`Wallet for user ${userId} locked: ${reason}`);
    return wallet;
  }

  // ── Payments & Subscriptions ─────────────────────────────

  async getPayments(query: {
    page?: number;
    limit?: number;
    status?: string;
    productSlug?: string;
    userId?: string;
    provider?: string;
    from?: string;
    to?: string;
  }) {
    const {
      page = 1,
      limit = 50,
      status,
      productSlug,
      userId,
      provider,
      from,
      to,
    } = query;
    const where: any = {};
    if (status) where.status = status;
    if (productSlug) where.productSlug = productSlug;
    if (userId) where.userId = userId;
    if (provider) where.provider = provider;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getSubscriptions(query: {
    page?: number;
    limit?: number;
    status?: string;
    productSlug?: string;
    tier?: string;
    userId?: string;
  }) {
    const { page = 1, limit = 50, status, productSlug, tier, userId } = query;
    const where: any = {};
    if (status) where.status = status;
    if (productSlug) where.productSlug = productSlug;
    if (tier) where.tier = tier;
    if (userId) where.userId = userId;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Revenue ───────────────────────────────────────────────

  /**
   * Date-range revenue time series for the dashboard chart. Distinct from
   * getRevenueReport below (which is period-name based, e.g. 'month') —
   * that one isn't called by the controller but is left in place in case
   * something else in the codebase uses it.
   */
  async getRevenueTimeSeries(
    from?: string,
    to?: string,
    groupBy: "day" | "week" | "month" = "day",
  ) {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 90 * 86400000);

    const payments = await this.prisma.payment.findMany({
      where: { status: "SUCCESS", paidAt: { gte: fromDate, lte: toDate } },
      select: { amountNGN: true, paidAt: true, productSlug: true },
      orderBy: { paidAt: "asc" },
    });

    const bucketKey = (date: Date): string => {
      if (groupBy === "month") {
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      if (groupBy === "week") {
        const d = new Date(date);
        const isoDay = d.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
        d.setUTCDate(d.getUTCDate() - isoDay + 1);
        return d.toISOString().split("T")[0];
      }
      return date.toISOString().split("T")[0];
    };

    const buckets: Record<string, { revenue: number; transactions: number }> =
      {};
    for (const p of payments) {
      const key = bucketKey(p.paidAt!);
      if (!buckets[key]) buckets[key] = { revenue: 0, transactions: 0 };
      buckets[key].revenue += p.amountNGN;
      buckets[key].transactions++;
    }

    const series = Object.entries(buckets)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([bucket, data]) => ({ bucket, ...data }));

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      groupBy,
      totalRevenue: payments.reduce((sum, p) => sum + p.amountNGN, 0),
      totalTransactions: payments.length,
      series,
    };
  }

  async getRevenueReport(period: "week" | "month" | "quarter" | "year") {
    const periodMap = {
      week: 7,
      month: 30,
      quarter: 90,
      year: 365,
    };
    const days = periodMap[period];
    const from = new Date(Date.now() - days * 86400000);

    const payments = await this.prisma.payment.findMany({
      where: { status: "SUCCESS", paidAt: { gte: from } },
      select: {
        amountNGN: true,
        productSlug: true,
        paidAt: true,
        channel: true,
      },
      orderBy: { paidAt: "asc" },
    });

    // Group by day
    const byDay: Record<string, { revenue: number; transactions: number }> = {};
    for (const p of payments) {
      const day = p.paidAt!.toISOString().split("T")[0];
      if (!byDay[day]) byDay[day] = { revenue: 0, transactions: 0 };
      byDay[day].revenue += p.amountNGN;
      byDay[day].transactions++;
    }

    const total = payments.reduce((sum, p) => sum + p.amountNGN, 0);

    return {
      period,
      from: from.toISOString(),
      to: new Date().toISOString(),
      totalRevenue: total,
      totalTransactions: payments.length,
      avgTransactionValue:
        payments.length > 0 ? Math.round(total / payments.length) : 0,
      dailyBreakdown: Object.entries(byDay).map(([date, data]) => ({
        date,
        ...data,
      })),
    };
  }

  // ── VibeCoders ────────────────────────────────────────────

  async getVibeCodersApplicants(query: {
    page?: number;
    limit?: number;
    status?: string;
    cohortId?: string;
    search?: string;
  }) {
    const { page = 1, limit = 50, status, cohortId, search } = query;
    const where: any = {};
    if (status) where.status = status;
    if (cohortId) where.cohortId = cohortId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.vibeCoderApplicant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { cohort: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.vibeCoderApplicant.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Waitlist ──────────────────────────────────────────────

  async getWaitlistStats() {
    return this.prisma.waitlistEntry.groupBy({
      by: ["productSlug"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
  }

  async inviteFromWaitlist(productSlug: string, count = 10) {
    const entries = await this.prisma.waitlistEntry.findMany({
      where: { productSlug, status: "PENDING" },
      orderBy: { position: "asc" },
      take: count,
    });

    const ids = entries.map((e) => e.id);
    await this.prisma.waitlistEntry.updateMany({
      where: { id: { in: ids } },
      data: { status: "INVITED", invitedAt: new Date() },
    });

    return { invited: entries.length, emails: entries.map((e) => e.email) };
  }

  async getAdminLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [rawLogs, total] = await Promise.all([
      this.prisma.adminLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          admin: { select: { name: true, email: true } },
        },
      }),
      this.prisma.adminLog.count(),
    ]);

    const targetIds = rawLogs
      .filter((l) => l.targetType === "users" && l.targetId)
      .map((l) => l.targetId as string);

    const targetUsersMap = new Map();
    if (targetIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: targetIds } },
        select: { id: true, name: true, email: true },
      });
      users.forEach((u) =>
        targetUsersMap.set(u.id, { name: u.name, email: u.email }),
      );
    }

    const logs = rawLogs.map((log) => {
      const { admin, ...rest } = log;
      return {
        ...rest,
        actor: admin,
        target:
          log.targetType === "users" && log.targetId
            ? targetUsersMap.get(log.targetId) || null
            : null,
      };
    });

    return { data: logs, meta: { total, page, limit } };
  }

  // ── Periodic cache invalidation ───────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async refreshDashboardCache() {
    await this.redis.del(AdminService.DASHBOARD_CACHE_KEY);
    this.logger.debug("Admin dashboard cache invalidated");
  }
}
