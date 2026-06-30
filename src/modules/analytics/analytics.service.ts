import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
    ) { }

    // ─── EVENT TRACKING ───────────────────────────────────────────────────────────

    async trackEvent(data: {
        userId?: string;
        event: string;
        properties?: Record<string, any>;
        source?: string;
        sessionId?: string;
        page?: string;
        referrer?: string;
        userAgent?: string;
        ip?: string;
    }) {
        try {
            await this.prisma.analyticsEvent.create({ data: data as any });
        } catch (err) {
            this.logger.warn('Failed to track event', err);
        }
        return { tracked: true };
    }

    async trackPageView(data: {
        userId?: string;
        page: string;
        referrer?: string;
        sessionId?: string;
        userAgent?: string;
        ip?: string;
    }) {
        return this.trackEvent({
            ...data,
            event: 'page_view',
            properties: { page: data.page, referrer: data.referrer },
        });
    }

    // ─── DASHBOARD STATS ──────────────────────────────────────────────────────────

    async getDashboard(period: 'day' | 'week' | 'month' = 'week') {
        const cacheKey = `analytics:dashboard:${period}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const since = this.getSinceDate(period);

        const [totalUsers, newUsers, totalEvents, topPages, topEvents] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { createdAt: { gte: since } } }),
            this.prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
            this.prisma.analyticsEvent.groupBy({
                by: ['page'],
                where: { createdAt: { gte: since }, page: { not: null } },
                _count: true,
                orderBy: { _count: { page: 'desc' } },
                take: 10,
            }),
            this.prisma.analyticsEvent.groupBy({
                by: ['event'],
                where: { createdAt: { gte: since } },
                _count: true,
                orderBy: { _count: { event: 'desc' } },
                take: 10,
            }),
        ]);

        const result = { totalUsers, newUsers, totalEvents, topPages, topEvents, period };
        await this.redis.set(cacheKey, JSON.stringify(result), 300);
        return result;
    }

    // ─── USER ANALYTICS ───────────────────────────────────────────────────────────

    async getUserAnalytics(userId: string, period: 'day' | 'week' | 'month' = 'week') {
        const since = this.getSinceDate(period);
        const events = await this.prisma.analyticsEvent.findMany({
            where: { userId, createdAt: { gte: since } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });

        return {
            totalEvents: events.length,
            events,
            period,
        };
    }

    // ─── PRODUCT ANALYTICS ────────────────────────────────────────────────────────

    async getProductUsage(period: 'day' | 'week' | 'month' = 'week') {
        const since = this.getSinceDate(period);
        return this.prisma.analyticsEvent.groupBy({
            by: ['source'],
            where: { createdAt: { gte: since }, source: { not: null } },
            _count: true,
            orderBy: { _count: { source: 'desc' } },
        });
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────────

    private getSinceDate(period: 'day' | 'week' | 'month'): Date {
        const ms = {
            day: 24 * 60 * 60 * 1000,
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
        };
        return new Date(Date.now() - ms[period]);
    }
}
