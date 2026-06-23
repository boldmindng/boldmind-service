import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';

@Injectable()
export class PlanAIAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUserAnalytics(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      jobsByType,
      recentRevenue,
      activeSubscription,
      storeMetrics,
      taskMetrics,
      workoutStreak,
    ] = await Promise.all([
      // Jobs grouped by type
      this.prisma.planAIJob.groupBy({
        by: ['type', 'status'],
        where: { userId },
        _count: { id: true },
      }),
      // Revenue in last 30 days
      this.prisma.payment.aggregate({
        where: { userId, status: 'SUCCESS', paidAt: { gte: thirtyDaysAgo } },
        _sum: { amountNGN: true },
        _count: { id: true },
      }),
      // Current subscription
      this.prisma.subscription.findUnique({
        where: { userId_productSlug: { userId, productSlug: 'planai' } },
        select: { tier: true, status: true, currentPeriodEnd: true },
      }),
      // Store metrics
      this.prisma.store.aggregate({
        where: { userId },
        _sum: { totalRevenue: true, totalOrders: true },
        _count: { id: true },
      }),
      // Task completion rate
      this.prisma.task.groupBy({
        by: ['status'],
        where: { createdById: userId },
        _count: { id: true },
      }),
      // Fitness streak
      this.prisma.fitnessStreak.findUnique({
        where: { userId },
        select: { current: true, longest: true },
      }),
    ]);

    // Process jobs by type into a cleaner shape
    const jobsSummary = jobsByType.reduce<Record<string, Record<string, number>>>(
      (acc, row) => {
        if (!acc[row.type]) acc[row.type] = {};
        acc[row.type][row.status] = row._count.id;
        return acc;
      },
      {},
    );

    const taskSummary = taskMetrics.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    const totalTasks = Object.values(taskSummary).reduce((a, b) => a + b, 0);
    const completionRate = totalTasks > 0
      ? Math.round(((taskSummary['DONE'] ?? 0) / totalTasks) * 100)
      : 0;

    return {
      subscription: activeSubscription,
      jobs: {
        byType: jobsSummary,
        totalRun: jobsByType.reduce((sum, row) => sum + row._count.id, 0),
      },
      revenue: {
        last30DaysNGN: (recentRevenue._sum.amountNGN ?? 0) / 100,
        transactionCount: recentRevenue._count.id,
      },
      stores: {
        count: storeMetrics._count.id,
        totalRevenueNGN: (storeMetrics._sum.totalRevenue ?? 0) / 100,
        totalOrders: storeMetrics._sum.totalOrders ?? 0,
      },
      tasks: { summary: taskSummary, completionRate },
      fitness: { currentStreak: workoutStreak?.current ?? 0, longestStreak: workoutStreak?.longest ?? 0 },
    };
  }

   async getUserAnalytics1(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cacheKey = `planai:analytics:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const [jobsByType, revenue30d, storeMetrics, taskMetrics, fitnessStreak] = await Promise.all([
      this.prisma.planAIJob.groupBy({ by: ['type', 'status'], where: { userId }, _count: { id: true } }),
      this.prisma.payment.aggregate({ where: { userId, status: 'SUCCESS', paidAt: { gte: thirtyDaysAgo } }, _sum: { amountNGN: true }, _count: { id: true } }),
      this.prisma.store.aggregate({ where: { userId }, _sum: { totalRevenue: true, totalOrders: true }, _count: { id: true } }),
      this.prisma.task.groupBy({ by: ['status'], where: { createdById: userId }, _count: { id: true } }),
      this.prisma.fitnessStreak.findUnique({ where: { userId }, select: { current: true, longest: true } }),
    ]);

    const taskMap = Object.fromEntries(taskMetrics.map((t) => [t.status, t._count.id]));
    const totalTasks = Object.values(taskMap).reduce((a, b) => a + b, 0);

    const result = {
      jobs: {
        byType: jobsByType.reduce<Record<string, Record<string, number>>>((acc, r) => {
          if (!acc[r.type]) acc[r.type] = {};
          acc[r.type][r.status] = r._count.id;
          return acc;
        }, {}),
        total: jobsByType.reduce((s, r) => s + r._count.id, 0),
      },
      revenue: { last30DaysNGN: (revenue30d._sum.amountNGN ?? 0) / 100, transactions: revenue30d._count.id },
      stores: { count: storeMetrics._count.id, revenueNGN: (storeMetrics._sum.totalRevenue ?? 0) / 100, orders: storeMetrics._sum.totalOrders ?? 0 },
      tasks: { summary: taskMap, completionRate: totalTasks > 0 ? Math.round(((taskMap['DONE'] ?? 0) / totalTasks) * 100) : 0 },
      fitness: { currentStreak: fitnessStreak?.current ?? 0, longestStreak: fitnessStreak?.longest ?? 0 },
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

    async getToolUsage(userId: string) {
    return this.prisma.planAIJob.groupBy({
      by: ['productSlug'],
      where: { userId, status: 'COMPLETED' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
  }

  async getToolUsageBreakdown(userId: string) {
    const jobs = await this.prisma.planAIJob.groupBy({
      by: ['productSlug'],
      where: { userId, status: 'COMPLETED' },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    return jobs.map((j) => ({
      tool: j.productSlug ?? 'planai',
      jobsCompleted: j._count.id,
    }));
  }

  async getAdminAnalytics() {
    const [totalUsers, activeSubscriptions, revenueThisMonth, jobsThisMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({
        where: { productSlug: 'planai', status: { in: ['ACTIVE', 'TRIAL'] } },
      }),
      this.prisma.payment.aggregate({
        where: {
          status: 'SUCCESS',
          productSlug: 'planai',
          paidAt: { gte: new Date(new Date().setDate(1)) },
        },
        _sum: { amountNGN: true },
      }),
      this.prisma.planAIJob.count({
        where: { createdAt: { gte: new Date(new Date().setDate(1)) } },
      }),
    ]);

    return {
      totalUsers,
      activeSubscriptions,
      revenueThisMonthNGN: (revenueThisMonth._sum.amountNGN ?? 0) / 100,
      jobsThisMonth,
    };
  }

   async getAdminStats() {
    const startOfMonth = new Date(new Date().setDate(1));
    const [totalUsers, activeSubs, revenueMonth, jobsMonth] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.subscription.count({ where: { productSlug: 'planai', status: { in: ['ACTIVE', 'TRIAL'] } } }),
      this.prisma.payment.aggregate({ where: { status: 'SUCCESS', productSlug: 'planai', paidAt: { gte: startOfMonth } }, _sum: { amountNGN: true } }),
      this.prisma.planAIJob.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    return {
      totalUsers,
      activeSubs,
      revenueMonthNGN: (revenueMonth._sum.amountNGN ?? 0) / 100,
      jobsThisMonth: jobsMonth,
    };
  }
}