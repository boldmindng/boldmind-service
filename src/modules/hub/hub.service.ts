import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import { ReferralService } from "../user/referral.service";
import { BOLDMIND_PRODUCTS } from "@boldmindng/utils";

@Injectable()
export class HubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly referralService: ReferralService,
  ) {}

  // ── Ecosystem / products ──────────────────────────────────

  /**
   * Public "full ecosystem map". This is what the old getProducts()
   * already did — folded in here under the name the controller expects
   * rather than keeping a duplicate method around.
   */
  getEcosystem() {
    return BOLDMIND_PRODUCTS.map((p) => ({
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

  /**
   * Authenticated "which products do I have access to" — distinct from
   * getEcosystem() above (public catalog) by annotating each product with
   * the caller's actual subscription state.
   */
  async getUserProducts(userId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
      select: {
        productSlug: true,
        status: true,
        tier: true,
        currentPeriodEnd: true,
        planCode: true,
      },
    });
    const subsBySlug = new Map(subscriptions.map((s) => [s.productSlug, s]));

    return BOLDMIND_PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      icon: p.icon,
      description: p.description,
      category: p.category,
      domain: p.domain,
      hasAccess: subsBySlug.has(p.slug),
      subscription: subsBySlug.get(p.slug) ?? null,
    }));
  }

  getPricing() {
    return [
      {
        id: "free",
        name: "Free",
        tier: "FREE",
        priceNGN: 0,
        interval: "forever",
        description: "Get started with the basics",
        features: [
          "Access to public content",
          "Basic dashboard",
          "1 active product",
        ],
        cta: "Get Started",
        isPopular: false,
      },
      {
        id: "starter",
        name: "Starter",
        tier: "STARTER",
        priceNGN: 2500,
        interval: "month",
        description: "For individuals ready to grow",
        features: [
          "Up to 3 active products",
          "Priority support",
          "Analytics dashboard",
          "Email notifications",
        ],
        cta: "Start for ₦2,500/mo",
        isPopular: false,
      },
      {
        id: "pro",
        name: "Pro",
        tier: "PRO",
        priceNGN: 7500,
        interval: "month",
        description: "For serious founders & creators",
        features: [
          "Unlimited products",
          "Advanced analytics",
          "AI tools access",
          "Team (up to 5)",
          "Priority support",
          "Custom domain",
        ],
        cta: "Go Pro — ₦7,500/mo",
        isPopular: true,
      },
      {
        id: "agency",
        name: "Agency",
        tier: "AGENCY",
        priceNGN: 25000,
        interval: "month",
        description: "For teams & agencies scaling fast",
        features: [
          "Everything in Pro",
          "Team (up to 20)",
          "White-label options",
          "API access",
          "Dedicated support",
          "SLA guarantee",
        ],
        cta: "Contact Sales",
        isPopular: false,
      },
    ];
  }

  // ── Dashboard ──────────────────────────────────────────────

  /**
   * Per-user hub dashboard: subscriptions, recent activity, product
   * access, wallet balance. This is what the controller actually calls
   * (getDashboardStats(user.sub)) — see getEcosystemStats() below for
   * the previous global-stats implementation that used to live under
   * this name.
   */
  async getDashboardStats(userId: string) {
    return this.redis.withCache(
      `hub:dashboard:${userId}`,
      async () => {
        const [subscriptions, recentActivity, wallet] = await Promise.all([
          this.prisma.subscription.findMany({
            where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
            select: {
              productSlug: true,
              status: true,
              tier: true,
              currentPeriodEnd: true,
              planCode: true,
            },
          }),
          this.prisma.activityLog.findMany({
            where: { userId },
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              action: true,
              resource: true,
              productSlug: true,
              createdAt: true,
            },
          }),
          this.prisma.wallet.findUnique({
            where: { userId },
            select: { balanceKobo: true, tier: true, isLocked: true },
          }),
        ]);

        const activeSlugs = new Set(subscriptions.map((s) => s.productSlug));
        const productAccess = BOLDMIND_PRODUCTS.map((p) => ({
          slug: p.slug,
          name: p.name,
          hasAccess: activeSlugs.has(p.slug),
          subscription:
            subscriptions.find((s) => s.productSlug === p.slug) ?? null,
        }));

        return {
          subscriptions,
          productAccess,
          recentActivity: recentActivity.map((a) => ({
            id: a.id,
            action: a.action,
            entityType: a.resource ?? a.productSlug ?? "system",
            createdAt: a.createdAt.toISOString(),
          })),
          wallet: {
            balanceKobo: wallet?.balanceKobo ?? 0,
            tier: wallet?.tier ?? null,
            isLocked: wallet?.isLocked ?? false,
          },
        };
      },
      60,
    );
  }

  // ── Stats (role-aware) ──────────────────────────────────────

  /**
   * Single entry point for GET /hub/stats. Branches by the caller's DB role
   * (not the JWT payload, since we don't have confirmed visibility into
   * whether the token carries role) rather than requiring two separate
   * routes: admins get the ecosystem-wide numbers, everyone else gets their
   * own personal stats.
   */
  async getStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isAdmin = user?.role === "admin" || user?.role === "super_admin";
    return isAdmin ? this.getEcosystemStats() : this.getMyStats(userId);
  }

  /**
   * Personal stats for a regular user — distinct from getDashboardStats()
   * above (which is product-access + activity + wallet oriented). This is
   * the numbers-card view: spend, active products, wallet, referrals.
   */
  async getMyStats(userId: string) {
    return this.redis.withCache(
      `hub:stats:user:${userId}`,
      async () => {
        const [
          user,
          subscriptions,
          spend,
          wallet,
          referralStats,
          activityCount,
          recentLedger,
        ] = await Promise.all([
          this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true, createdAt: true },
          }),
          this.prisma.subscription.findMany({
            where: { userId, status: { in: ["ACTIVE", "TRIAL"] } },
            select: {
              productSlug: true,
              tier: true,
              status: true,
              currentPeriodEnd: true,
            },
          }),
          this.prisma.payment.aggregate({
            where: { userId, status: "SUCCESS" },
            _sum: { amountNGN: true },
            _count: true,
          }),
          this.prisma.wallet.findUnique({
            where: { userId },
            select: { balanceKobo: true, tier: true, isLocked: true },
          }),
          this.referralService.getStats(userId),
          this.prisma.activityLog.count({ where: { userId } }),
          this.prisma.walletLedger.findMany({
            where: { wallet: { userId } },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              type: true,
              amountKobo: true,
              description: true,
              source: true,
              createdAt: true,
            },
          }),
        ]);

        return {
          member: {
            name: user?.name ?? null,
            email: user?.email ?? null,
            memberSince: user?.createdAt?.toISOString() ?? null,
          },
          products: {
            activeCount: subscriptions.length,
            active: subscriptions.map((s) => ({
              productSlug: s.productSlug,
              productName:
                BOLDMIND_PRODUCTS.find((p) => p.slug === s.productSlug)?.name ??
                s.productSlug,
              tier: s.tier,
              status: s.status,
              currentPeriodEnd: s.currentPeriodEnd,
            })),
          },
          spend: {
            totalPaidNGN: spend._sum.amountNGN ?? 0,
            totalTransactions: spend._count,
          },
          wallet: {
            balanceKobo: wallet?.balanceKobo ?? 0,
            tier: wallet?.tier ?? null,
            isLocked: wallet?.isLocked ?? false,
            recentLedger,
          },
          referrals: referralStats,
          activityCount,
        };
      },
      60, // 1 min cache — same TTL as getDashboardStats
    );
  }

  /**
   * The previous getDashboardStats() body — global ecosystem stats
   * (admin counts, MRR, top products, system health). Nothing in
   * hub.controller.ts calls this; keeping it under a new name rather
   * than deleting it, since it's not obviously dead — it may be used
   * elsewhere, or intended for an admin-facing hub view that doesn't
   * exist yet. Worth confirming whether it's still needed.
   */
  async getEcosystemStats() {
    return this.redis.withCache(
      "hub:ecosystem:stats",
      async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        );

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
          this.prisma.user.count({
            where: { createdAt: { gte: startOfMonth }, isActive: true },
          }),
          this.prisma.user.count({
            where: {
              createdAt: { gte: startOfLastMonth, lt: startOfMonth },
              isActive: true,
            },
          }),
          this.prisma.user.count({
            where: { role: { in: ["admin", "super_admin", "manager"] as any } },
          }),
          this.prisma.subscription.groupBy({
            by: ["productSlug"],
            where: { status: { in: ["ACTIVE", "TRIAL"] } },
            _count: { userId: true },
            orderBy: { _count: { userId: "desc" } },
            take: 5,
          }),
          this.prisma.activityLog.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              action: true,
              resource: true,
              createdAt: true,
              user: { select: { name: true, email: true } },
            },
          }),
          this.prisma.payment.aggregate({
            where: {
              status: "SUCCESS" as any,
              createdAt: { gte: startOfMonth },
            },
            _sum: { amountNGN: true },
          }),
        ]);

        const growth =
          newUsersLastMonth === 0
            ? 100
            : Math.round(
                ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) *
                  100,
              );

        return {
          userStats: {
            totals: {
              users: totalUsers,
              activeProducts: topProducts.reduce(
                (a, p) => a + p._count.userId,
                0,
              ),
              admins: adminCount,
            },
            growth: {
              trend: growth > 0 ? "up" : growth < 0 ? "down" : "stable",
              percentage: Math.abs(growth),
              currentMonth: newUsersThisMonth,
            },
            topProducts: topProducts.map((p) => ({
              productSlug: p.productSlug,
              productName:
                BOLDMIND_PRODUCTS.find((bp) => bp.slug === p.productSlug)
                  ?.name ?? p.productSlug,
              userCount: p._count.userId,
            })),
          },
          ecosystemOverview: {
            totalMonthlyRevenue: totalRevenue._sum.amountNGN ?? 0,
            totalTeamSize: adminCount,
          },
          recentActivity: recentActivity.map((a) => ({
            id: a.id,
            action: a.action,
            entityType: a.resource ?? "system",
            createdAt: a.createdAt.toISOString(),
            user: {
              fullName: a.user?.name ?? "System",
              email: a.user?.email ?? "",
            },
          })),
          systemHealth: [
            { name: "Database", status: "healthy", responseTime: 12 },
            { name: "Redis", status: "healthy", responseTime: 3 },
            { name: "Auth API", status: "healthy", responseTime: 45 },
          ],
        };
      },
      60,
    );
  }

  // ── Referrals ──────────────────────────────────────────────

  async generateReferral(userId: string) {
    const code = await this.referralService.getOrCreateCode(userId);
    // NOTE: hardcoding a fallback domain since HubService doesn't have a
    // config service wired in — point HUB_URL at whatever the real
    // referral-landing domain is.
    const baseUrl = process.env.HUB_URL || "https://boldmind.ng";
    return { code, link: `${baseUrl}/join?ref=${code}` };
  }

  getReferralStats(userId: string) {
    return this.referralService.getStats(userId);
  }

  // ── Waitlist ───────────────────────────────────────────────

  async getWaitlistPosition(productSlug: string, email: string) {
    if (!email?.trim()) throw new BadRequestException("email is required");

    const entry = await this.prisma.waitlistEntry.findUnique({
      where: { email_productSlug: { email: email.toLowerCase(), productSlug } },
    });
    if (!entry) return { onWaitlist: false };

    const peopleAhead =
      entry.status === "PENDING"
        ? await this.prisma.waitlistEntry.count({
            where: {
              productSlug,
              status: "PENDING",
              position: { lt: entry.position },
            },
          })
        : 0;

    return {
      onWaitlist: true,
      status: entry.status,
      position: entry.position,
      peopleAhead,
    };
  }

  async joinWaitlist(productSlug: string, email: string, name?: string) {
    if (!email?.trim()) throw new BadRequestException("email is required");
    const normalizedEmail = email.toLowerCase();

    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email_productSlug: { email: normalizedEmail, productSlug } },
    });
    if (existing) {
      return {
        alreadyJoined: true,
        position: existing.position,
        status: existing.status,
      };
    }

    // NOTE: count-then-create has a race window under concurrent joins
    // for the same product — two people could land on the same position.
    // Fine for current volume; wrap in a transaction/advisory lock if
    // that becomes a real problem.
    const count = await this.prisma.waitlistEntry.count({
      where: { productSlug },
    });
    const entry = await this.prisma.waitlistEntry.create({
      data: {
        email: normalizedEmail,
        name,
        productSlug,
        position: count + 1,
        source: "hub",
      },
    });

    return {
      alreadyJoined: false,
      position: entry.position,
      status: entry.status,
    };
  }

  // ── Changelog / status ─────────────────────────────────────

  /**
   * NOTE: there's no Changelog model in schema.prisma. Returning an
   * empty paginated shape so the endpoint doesn't 500, but this isn't
   * real data — it needs either a real table or a different source of
   * truth (headless CMS, static JSON, etc.) before it's useful.
   */
  async getChangelog(page = 1, pageSize = 20) {
    return {
      data: [],
      meta: { total: 0, page, pageSize, totalPages: 0 },
    };
  }

  /**
   * NOTE: same gap as changelog — nothing in the schema tracks incident
   * history (the Incident model that exists is SafeAI's crime-reporting
   * entity, unrelated). This only reports live health right now; there's
   * no persisted "past outages" list to include.
   */
  async getSystemStatus() {
    const checks: Record<string, { status: string; latencyMs?: number }> = {};

    const pgStart = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "operational",
        latencyMs: Date.now() - pgStart,
      };
    } catch {
      checks.database = { status: "outage" };
    }

    const redisStart = Date.now();
    try {
      await this.redis.cache.ping();
      checks.redis = {
        status: "operational",
        latencyMs: Date.now() - redisStart,
      };
    } catch {
      checks.redis = { status: "outage" };
    }

    const allOperational = Object.values(checks).every(
      (c) => c.status === "operational",
    );

    return {
      status: allOperational ? "operational" : "degraded",
      components: checks,
      incidents: [], // no incident-history model backing this yet
      timestamp: new Date().toISOString(),
    };
  }

  // ── Team ───────────────────────────────────────────────────

  async getTeam() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [
            "admin",
            "super_admin",
            "manager",
            "editor",
            "support",
            "analyst",
          ] as any,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
        lastLoginAt: true,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async inviteTeamMember(email: string, role: string, invitedBy: string) {
    const normalizedRole = role.toLowerCase();

    // Find if user exists; if not, we'd queue an invite email
    const existing = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { role: normalizedRole as any },
      });
      await this.prisma.adminLog.create({
        data: {
          adminId: invitedBy,
          targetId: existing.id,
          targetType: "users",
          action: "INVITE_TEAM_MEMBER",
          metadata: { role: normalizedRole, existingUser: true },
        },
      });
      return { message: "User role updated successfully", userId: existing.id };
    }
    await this.prisma.adminLog.create({
      data: {
        adminId: invitedBy,
        targetType: "users",
        action: "INVITE_TEAM_MEMBER",
        metadata: {
          email: email.toLowerCase(),
          role: normalizedRole,
          existingUser: false,
        },
      },
    });
    // Return invite pending — email sending would be queued here
    return { message: "Invite sent successfully", pending: true };
  }

  async removeTeamMember(targetUserId: string, actorId: string) {
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: "guest" as any },
    });
    await this.prisma.adminLog.create({
      data: {
        adminId: actorId,
        targetId: targetUserId,
        targetType: "users",
        action: "REMOVE_TEAM_MEMBER",
      },
    });
    return { message: "Team member removed" };
  }
}
