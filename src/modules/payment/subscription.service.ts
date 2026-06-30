import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { CreateSubscriptionDto } from './payment.dto';

@Injectable()
export class SubscriptionService {
    private readonly logger = new Logger(SubscriptionService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly redis: RedisService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    // ─── CREATE SUBSCRIPTION ─────────────────────────────────────────────────────

    async createSubscription(userId: string, dto: CreateSubscriptionDto) {
        // Check for existing active subscription to same product
        const existing = await this.prisma.subscription.findFirst({
            where: {
                userId,
                productSlug: dto.productSlug,
                status: { in: ['ACTIVE', 'TRIAL'] },
            },
        });
        if (existing) {
            throw new BadRequestException('You already have an active subscription to this product');
        }

        const intervalDays = this.getIntervalDays(dto.interval);
        const now = new Date();
        const periodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

        const subscription = await this.prisma.subscription.create({
            data: {
                userId,
                productSlug: dto.productSlug,
                planName: dto.planName,
                amountNGN: dto.amountNGN,
                interval: dto.interval,
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
            },
        });

        this.eventEmitter.emit('subscription.created', {
            userId,
            subscriptionId: subscription.id,
            productSlug: dto.productSlug,
        });

        this.logger.log(`Subscription created: ${subscription.id} for user ${userId}`);
        return subscription;
    }

    // ─── START TRIAL ──────────────────────────────────────────────────────────────

    async startTrial(userId: string, productSlug: string, trialDays = 7) {
        const existing = await this.prisma.subscription.findFirst({
            where: { userId, productSlug, status: { in: ['ACTIVE', 'TRIAL'] } },
        });
        if (existing) {
            throw new BadRequestException('Already subscribed or on trial for this product');
        }

        const now = new Date();
        const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

        return this.prisma.subscription.create({
            data: {
                userId,
                productSlug,
                planName: 'Trial',
                amountNGN: 0,
                interval: 'trial',
                status: 'TRIAL',
                currentPeriodStart: now,
                currentPeriodEnd: trialEnd,
            },
        });
    }

    // ─── CANCEL SUBSCRIPTION ─────────────────────────────────────────────────────

    async cancelSubscription(userId: string, subscriptionId: string) {
        const sub = await this.prisma.subscription.findFirst({
            where: { id: subscriptionId, userId, status: { in: ['ACTIVE', 'TRIAL'] } },
        });
        if (!sub) throw new NotFoundException('Active subscription not found');

        const updated = await this.prisma.subscription.update({
            where: { id: subscriptionId },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
        });

        this.eventEmitter.emit('subscription.cancelled', {
            userId,
            subscriptionId,
            productSlug: sub.productSlug,
        });

        return updated;
    }

    // ─── RENEW SUBSCRIPTION ──────────────────────────────────────────────────────

    async renewSubscription(subscriptionId: string) {
        const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
        if (!sub) throw new NotFoundException('Subscription not found');

        const intervalDays = this.getIntervalDays(sub.interval);
        const now = new Date();
        const newPeriodEnd = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

        return this.prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: newPeriodEnd,
                cancelledAt: null,
            },
        });
    }

    // ─── CHECK ACCESS ─────────────────────────────────────────────────────────────

    async checkAccess(userId: string, productSlug: string): Promise<boolean> {
        const sub = await this.prisma.subscription.findFirst({
            where: {
                userId,
                productSlug,
                status: { in: ['TRIAL', 'ACTIVE'] },
                currentPeriodEnd: { gte: new Date() },
            },
        });
        return !!sub;
    }

    // ─── GET USER SUBSCRIPTIONS ───────────────────────────────────────────────────

    async getUserSubscriptions(userId: string) {
        return this.prisma.subscription.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    // ─── EVENT HANDLER: AUTO-CREATE SUBSCRIPTION ON PAYMENT SUCCESS ───────────────

    @OnEvent('payment.success')
    async handlePaymentSuccess(payload: {
        userId: string;
        paymentId: string;
        productSlug: string;
        amountNGN: number;
    }) {
        this.logger.log(`Payment success for ${payload.productSlug}, creating/renewing subscription`);

        const existing = await this.prisma.subscription.findFirst({
            where: {
                userId: payload.userId,
                productSlug: payload.productSlug,
                status: { in: ['ACTIVE', 'TRIAL', 'PAST_DUE'] },
            },
        });

        if (existing) {
            await this.renewSubscription(existing.id);
        } else {
            await this.createSubscription(payload.userId, {
                productSlug: payload.productSlug,
                planName: `${payload.productSlug} Plan`,
                amountNGN: payload.amountNGN,
                interval: 'monthly',
            });
        }
    }

    // ─── HELPERS ──────────────────────────────────────────────────────────────────

    private getIntervalDays(interval: string): number {
        switch (interval) {
            case 'monthly': return 30;
            case 'quarterly': return 90;
            case 'annually': return 365;
            case 'trial': return 7;
            default: return 30;
        }
    }
}
