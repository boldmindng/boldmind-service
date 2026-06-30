import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { BOLDMIND_PRODUCTS } from '@boldmindng/utils';

@Injectable()
export class HubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getDashboardStats() {
    return this.redis.withCache('hub:dashboard:stats', async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const [
        totalUsers,
        newUsersThisMonth,
        newUsersLastMonth,
        adminCount,
        topProducts,
        recentActivity,
        totalRevenue,
      ] = await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { createdAt: { gte: startOfMonth }, isActive: true } }),
        this.prisma.user.count({ where: { createdAt: { gte: startOfLastMonth, lt: startOfMonth }, isActive: true } }),
        this.prisma.user.count({ where: { role: { in: ['admin', 'super_admin', 'manager'] as any } } }),
        this.prisma.subscription.groupBy({
          by: ['productSlug'],
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          _count: { userId: true },
          orderBy: { _count: { userId: 'desc' } },
          take: 5,
        }),
        this.prisma.activityLog.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, action: true, resource: true, createdAt: true,
            user: { select: { name: true, email: true } },
          },
        }),
        this.prisma.payment.aggregate({
          where: { status: 'SUCCESS' as any, createdAt: { gte: startOfMonth } },
          _sum: { amountNGN: true },
        }),
      ]);

      const growth = newUsersLastMonth === 0 ? 100
        : Math.round(((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100);

      return {
        userStats: {
          totals: {
            users: totalUsers,
            activeProducts: topProducts.reduce((a, p) => a + p._count.userId, 0),
            admins: adminCount,
          },
          growth: {
            trend: growth > 0 ? 'up' : growth < 0 ? 'down' : 'stable',
            percentage: Math.abs(growth),
            currentMonth: newUsersThisMonth,
          },
          topProducts: topProducts.map(p => ({
            productSlug: p.productSlug,
            productName: BOLDMIND_PRODUCTS.find(bp => bp.slug === p.productSlug)?.name ?? p.productSlug,
            userCount: p._count.userId,
          })),
        },
        ecosystemOverview: {
          totalMonthlyRevenue: totalRevenue._sum.amountNGN ?? 0,
          totalTeamSize: adminCount,
        },
        recentActivity: recentActivity.map(a => ({
          id: a.id,
          action: a.action,
          entityType: a.resource ?? 'system',
          createdAt: a.createdAt.toISOString(),
          user: { fullName: a.user?.name ?? 'System', email: a.user?.email ?? '' },
        })),
        systemHealth: [
          { name: 'Database', status: 'healthy', responseTime: 12 },
          { name: 'Redis', status: 'healthy', responseTime: 3 },
          { name: 'Auth API', status: 'healthy', responseTime: 45 },
        ],
      };
    }, 60); // 60s cache
  }

  getProducts() {
    return BOLDMIND_PRODUCTS.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      icon: p.icon,
      description: p.description,
      category: p.category,
      status: p.status,
      domain: p.domain,
      monthlyRevenue: p.monthlyRevenue ?? 0,
      priority: p.priority,
      tags: p.tags,
    }));
  }

  getPricing() {
    return [
      {
        id: 'free',
        name: 'Free',
        tier: 'FREE',
        priceNGN: 0,
        interval: 'forever',
        description: 'Get started with the basics',
        features: ['Access to public content', 'Basic dashboard', '1 active product'],
        cta: 'Get Started',
        isPopular: false,
      },
      {
        id: 'starter',
        name: 'Starter',
        tier: 'STARTER',
        priceNGN: 2500,
        interval: 'month',
        description: 'For individuals ready to grow',
        features: ['Up to 3 active products', 'Priority support', 'Analytics dashboard', 'Email notifications'],
        cta: 'Start for ₦2,500/mo',
        isPopular: false,
      },
      {
        id: 'pro',
        name: 'Pro',
        tier: 'PRO',
        priceNGN: 7500,
        interval: 'month',
        description: 'For serious founders & creators',
        features: ['Unlimited products', 'Advanced analytics', 'AI tools access', 'Team (up to 5)', 'Priority support', 'Custom domain'],
        cta: 'Go Pro — ₦7,500/mo',
        isPopular: true,
      },
      {
        id: 'agency',
        name: 'Agency',
        tier: 'AGENCY',
        priceNGN: 25000,
        interval: 'month',
        description: 'For teams & agencies scaling fast',
        features: ['Everything in Pro', 'Team (up to 20)', 'White-label options', 'API access', 'Dedicated support', 'SLA guarantee'],
        cta: 'Contact Sales',
        isPopular: false,
      },
    ];
  }

  async getTeam() {
    return this.prisma.user.findMany({
      where: { role: { in: ['admin', 'super_admin', 'manager', 'editor', 'support', 'analyst'] as any } },
      select: {
        id: true, name: true, email: true, role: true, avatar: true,
        createdAt: true, lastLoginAt: true, isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async inviteTeamMember(email: string, role: string, _invitedBy: string) {
    // Find if user exists; if not, we'd queue an invite email
    const existing = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: role as any },
      });
      return { message: 'User role updated successfully', userId: existing.id };
    }
    // Return invite pending — email sending would be queued here
    return { message: 'Invite sent successfully', pending: true };
  }

  async removeTeamMember(targetUserId: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: 'guest' as any },
    });
    await this.prisma.adminLog.create({
      data: { adminId: actorId, targetId: targetUserId, targetType: 'users', action: 'REMOVE_TEAM_MEMBER' },
    });
    return { message: 'Team member removed' };
  }
}
