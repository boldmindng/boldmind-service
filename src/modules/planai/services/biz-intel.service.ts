import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { PlanAIJobService } from './planai-job.service';
import { GenerateBusinessPlanDto, FinancialForecastDto } from '../dto/all-planai.dto';
import { PlanAIJobType } from '@prisma/client';

@Injectable()
export class BizIntelService {
  private readonly logger = new Logger(BizIntelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly jobService: PlanAIJobService,
  ) {}

  // ─── Business plan (queued job) ───────────────────────────────────────────────

  async generateBusinessPlan(userId: string, dto: GenerateBusinessPlanDto) {
    return this.jobService.createJob(userId, {
      type: PlanAIJobType.BUSINESS_PLAN,
      input: { ...dto },
      productSlug: 'business-intelligence',
    });
  }

  // ─── Financial forecast (queued job) ─────────────────────────────────────────

  async generateFinancialForecast(userId: string, dto: FinancialForecastDto) {
    // Enrich with live Paystack revenue if connected
    let enrichedDto = { ...dto };
    const paystackRevenue = await this.getLiveRevenueNGN(userId);
    if (paystackRevenue > 0 && !dto.currentMonthlyRevenueNGN) {
      enrichedDto.currentMonthlyRevenueNGN = paystackRevenue;
    }

    return this.jobService.createJob(userId, {
      type: PlanAIJobType.FINANCIAL_FORECAST,
      input: enrichedDto,
      productSlug: 'business-intelligence',
    });
  }

  // ─── Pitch deck (queued job) ──────────────────────────────────────────────────

  async generatePitchDeck(userId: string, input: Record<string, unknown>) {
    return this.jobService.createJob(userId, {
      type: PlanAIJobType.PITCH_DECK,
      input,
      productSlug: 'business-intelligence',
    });
  }

  // ─── SWOT analysis (synchronous — fast enough) ───────────────────────────────

  async generateSwot(userId: string, input: { businessName: string; industry: string; description: string }) {
    const result = await this.ai.generateJson<{
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
      strategicSummary: string;
    }>(
      `You are a Nigerian business strategist. Valid JSON only.`,
      `Generate a SWOT analysis for a Nigerian ${input.industry} business.
Business: ${input.businessName}
Description: ${input.description}

Return JSON: { strengths: [5 items], weaknesses: [4 items], opportunities: [5 items], 
threats: [4 items], strategicSummary (2 sentences on biggest leverage point) }
Use Nigerian market context: NEPA costs, Naira volatility, local competition, CBN policies.`,
      { task: 'reasoning', temperature: 0.6, cacheTtl: 3600 },
    );

    await this.logActivity(userId, 'bizintel.swot_generated', { businessName: input.businessName });
    return result.content;
  }

  // ─── Analytics dashboard (live data) ─────────────────────────────────────────

  async getAnalyticsDashboard(userId: string) {
    const cacheKey = `bizintel:dashboard:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [storeMetrics, payments30d, totalPayments, jobs, tasks] = await Promise.all([
      this.prisma.store.aggregate({
        where: { userId },
        _sum: { totalRevenue: true, totalOrders: true },
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: { userId, status: 'SUCCESS', paidAt: { gte: thirtyDaysAgo } },
        _sum: { amountNGN: true },
        _count: { id: true },
      }),
      this.prisma.payment.aggregate({
        where: { userId, status: 'SUCCESS' },
        _sum: { amountNGN: true },
      }),
      this.prisma.planAIJob.groupBy({
        by: ['type'],
        where: { userId, status: 'COMPLETED' },
        _count: { id: true },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: { createdById: userId },
        _count: { id: true },
      }),
    ]);

    const taskMap = Object.fromEntries(tasks.map((t) => [t.status, t._count.id]));

    const dashboard = {
      revenue: {
        last30DaysNGN: (payments30d._sum.amountNGN ?? 0) / 100,
        allTimeNGN: (totalPayments._sum.amountNGN ?? 0) / 100,
        transactionCount30d: payments30d._count.id,
      },
      stores: {
        count: storeMetrics._count.id,
        allTimeRevenueNGN: (storeMetrics._sum.totalRevenue ?? 0) / 100,
        allTimeOrders: storeMetrics._sum.totalOrders ?? 0,
      },
      aiJobs: {
        total: jobs.reduce((s, j) => s + j._count.id, 0),
        byType: jobs.map((j) => ({ type: j.type, count: j._count.id })),
      },
      tasks: {
        total: Object.values(taskMap).reduce((a, b) => a + b, 0),
        done: taskMap['DONE'] ?? 0,
        inProgress: taskMap['IN_PROGRESS'] ?? 0,
        todo: taskMap['TODO'] ?? 0,
      },
      paystackConnected: !!(await this.prisma.subscription.findFirst({
        where: { userId, productSlug: 'planai', paystackSubCode: { not: null } },
      })),
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(dashboard)); // 5-min cache
    return dashboard;
  }

  // ─── Market size (NBS data + AI enrichment) ───────────────────────────────────

  async getMarketAnalysis(userId: string, input: { industry: string; targetStates?: string[] }) {
    const cacheKey = `bizintel:market:${input.industry}:${(input.targetStates ?? []).join(',')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const result = await this.ai.generateBusinessContent(
      'You are a Nigerian market research analyst with access to NBS (National Bureau of Statistics) data. Valid JSON only.',
      `Analyse the market opportunity for a Nigerian ${input.industry} business.
Target states: ${input.targetStates?.join(', ') ?? 'Nigeria-wide'}

Return JSON: {
  marketSizeTAM: string (Total Addressable Market with ₦ estimate),
  marketSizeSAM: string (Serviceable Addressable Market),
  keyTrends: [5 current trends in this Nigerian sector],
  topCompetitors: [{ name, strengths, weaknesses, estimatedMarketShare }],
  regulatoryRequirements: [{ body, requirement, priority }],
  entryBarriers: [string],
  growthDrivers: [string],
  nbsDataNote: string (relevant NBS statistics)
}`,
      { task: 'reasoning', temperature: 0.5, cacheTtl: 86400 },
    );

    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    await this.redis.setex(cacheKey, 86400, JSON.stringify(parsed));
    await this.logActivity(userId, 'bizintel.market_analysis', { industry: input.industry });
    return parsed;
  }

  // ─── Break-even calculator ────────────────────────────────────────────────────

  async calculateBreakEven(input: {
    fixedCostsNGN: number;
    variableCostPerUnitNGN: number;
    sellingPricePerUnitNGN: number;
  }) {
    const { fixedCostsNGN, variableCostPerUnitNGN, sellingPricePerUnitNGN } = input;
    const contributionMargin = sellingPricePerUnitNGN - variableCostPerUnitNGN;

    if (contributionMargin <= 0) {
      return { error: 'Selling price must be higher than variable cost per unit' };
    }

    const breakEvenUnits  = Math.ceil(fixedCostsNGN / contributionMargin);
    const breakEvenRevenue = breakEvenUnits * sellingPricePerUnitNGN;
    const marginPercent    = (contributionMargin / sellingPricePerUnitNGN) * 100;

    return {
      breakEvenUnits,
      breakEvenRevenueNGN: breakEvenRevenue,
      contributionMarginNGN: contributionMargin,
      contributionMarginPercent: Math.round(marginPercent * 10) / 10,
      monthsToBreakEven: null, // set by caller if they have monthly unit projections
      interpretation: `You need to sell ${breakEvenUnits.toLocaleString('en-NG')} units at ₦${sellingPricePerUnitNGN.toLocaleString('en-NG')} to cover all costs.`,
    };
  }

  // ─── Regulatory checklist ────────────────────────────────────────────────────

  async getRegulatoryChecklist(industry: string) {
    const cacheKey = `bizintel:regulatory:${industry}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const result = await this.ai.generateJson<{
      mandatory: Array<{ body: string; requirement: string; cost: string; timeline: string; link?: string }>;
      recommended: Array<{ body: string; requirement: string; benefit: string }>;
      notes: string;
    }>(
      'You are a Nigerian business compliance expert. Valid JSON only.',
      `List the regulatory requirements for starting and operating a Nigerian ${industry} business.

Return JSON: {
  mandatory: [{ body (CAC/FIRS/NAFDAC/SON/CBN/etc), requirement, cost (₦ estimate), timeline, link (if known) }],
  recommended: [{ body, requirement, benefit }],
  notes (key compliance gotcha for this industry)
}`,
      { task: 'reasoning', temperature: 0.3, cacheTtl: 604800 }, // 7-day cache — regulations don't change daily
    );

    await this.redis.setex(cacheKey, 604800, JSON.stringify(result.content));
    return result.content;
  }

  // ─── Paystack revenue pull ────────────────────────────────────────────────────

  private async getLiveRevenueNGN(userId: string): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const agg = await this.prisma.payment.aggregate({
        where: { userId, status: 'SUCCESS', paidAt: { gte: thirtyDaysAgo } },
        _sum: { amountNGN: true },
      });
      return (agg._sum.amountNGN ?? 0) / 100;
    } catch {
      return 0;
    }
  }

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'business-intelligence', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}