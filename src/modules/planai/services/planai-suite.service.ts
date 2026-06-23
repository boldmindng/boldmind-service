import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { SubscriptionTier, SubscriptionStatus, PlanAIJobType } from '@prisma/client';
import {
  PLANAI_PRICING,
  PLANAI_TOOL_SLUGS,
  TIER_TOOL_ACCESS,
  INDUSTRY_BUNDLES,
  PlanAIScore,
  PlanAIToolSlug,
  IndustryBundle,
} from '../planai.types';
import { OnboardingDto, PlanAIScoreQueryDto, MonthlyDigestDto } from '../dto/all-planai.dto';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';

@Injectable()
export class PlanAISuiteService {
  private readonly logger = new Logger(PlanAISuiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  // ─── Subscription / Access ───────────────────────────────────────────────────
  async getActiveSuiteSubscription(userId: string) {
    return this.prisma.subscription.findUnique({
      where: { userId_productSlug: { userId, productSlug: 'planai' } },
    });
  }

  async getSuiteDashboard(userId: string) {
    const [subscription, jobs, stores, tasks] = await Promise.all([
      this.getActiveSuiteSubscription(userId),
      this.prisma.planAIJob.count({ where: { userId } }),
      this.prisma.store.count({ where: { userId } }),
      this.prisma.task.count({ where: { createdById: userId } }),
    ]);

    const tier = (subscription?.tier ?? 'FREE') as SubscriptionTier;
    const accessibleTools = this.getAccessibleTools(tier);

    return {
      subscription: subscription
        ? {
            tier: subscription.tier,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            amountNGN: subscription.amountNGN / 100,
          }
        : null,
      toolAccess: {
        tier,
        accessible: accessibleTools,
        locked: PLANAI_TOOL_SLUGS.filter((s) => !accessibleTools.includes(s)),
        total: PLANAI_TOOL_SLUGS.length,
        activated: accessibleTools.length,
      },
      stats: { jobsRun: jobs, storesCreated: stores, tasksCreated: tasks },
      pricing: this.getPricingTable(),
    };
  }

  // ─── Onboarding ──────────────────────────────────────────────────────────────
  async onboard(userId: string, dto: OnboardingDto) {
    const { businessName, businessType, industryBundle, state, preferredLanguage, selectedTools } = dto;

    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, displayName: businessName, state, language: preferredLanguage ?? 'en' },
      update: { displayName: businessName, state, language: preferredLanguage ?? 'en' },
    });

    const recommended: PlanAIToolSlug[] = industryBundle
      ? [...INDUSTRY_BUNDLES[industryBundle as IndustryBundle]]
      : selectedTools ?? ['social-media-manager', 'brand-digital-home', 'project-manager'];

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'planai.onboarding_complete',
        productSlug: 'planai',
        metadata: { businessName, businessType, industryBundle, recommended },
      },
    });

    return {
      message: 'Onboarding complete',
      businessName,
      industryBundle: industryBundle ?? null,
      recommendedTools: recommended,
      nextStep: 'Visit your PlanAI dashboard to activate your first tool',
    };
  }

  // ─── Tool access guard ───────────────────────────────────────────────────────
  getAccessibleTools(tier: SubscriptionTier): PlanAIToolSlug[] {
    const access = TIER_TOOL_ACCESS[tier];
    if (access === 'all') return [...PLANAI_TOOL_SLUGS];
    return access as PlanAIToolSlug[];
  }

  async assertToolAccess(userId: string, toolSlug: PlanAIToolSlug): Promise<void> {
    const sub = await this.getActiveSuiteSubscription(userId);
    const tier = (sub?.tier ?? 'FREE') as SubscriptionTier;
    const isActive =
      !sub ||
      sub.status === SubscriptionStatus.ACTIVE ||
      sub.status === SubscriptionStatus.TRIAL;

    if (!isActive) {
      throw new ForbiddenException('Your PlanAI subscription is inactive. Please renew to continue.');
    }

    const accessible = this.getAccessibleTools(tier);
    if (!accessible.includes(toolSlug)) {
      throw new ForbiddenException(
        `${toolSlug} is not available on your current plan (${tier}). Upgrade to PlanAI Pro to unlock all 13 tools.`,
      );
    }
  }

  // ─── PlanAI Score ────────────────────────────────────────────────────────────
  async computePlanAIScore(userId: string, query: PlanAIScoreQueryDto): Promise<PlanAIScore> {
    // … unchanged (same logic as original)
    const [sub, jobs, stores, cbtSessions, workoutLogs, tasks, fitnessProfile] =
      await Promise.all([
        this.getActiveSuiteSubscription(userId),
        this.prisma.planAIJob.findMany({ where: { userId }, select: { type: true, status: true } }),
        this.prisma.store.findMany({ where: { userId }, select: { totalRevenue: true, totalOrders: true, status: true } }),
        this.prisma.cBTSession.count({ where: { userId } }),
        this.prisma.workoutLog.count({ where: { userId } }),
        this.prisma.task.count({ where: { createdById: userId, status: 'DONE' } }),
        this.prisma.fitnessProfile.findUnique({ where: { userId } }),
      ]);

    const tier = (sub?.tier ?? 'FREE') as SubscriptionTier;
    const toolsActivated = this.getAccessibleTools(tier).length;

    const digital_presence = Math.min(100, stores.length * 40 + (stores[0]?.totalOrders ?? 0));
    const marketing_reach = Math.min(100, jobs.filter((j) => j.type === 'MARKETING_CAMPAIGN').length * 20);
    const financial_clarity = Math.min(100, jobs.filter((j) => j.type === 'FINANCIAL_FORECAST' || j.type === 'BUSINESS_PLAN').length * 25);
    const operational_efficiency = Math.min(100, tasks * 5 + cbtSessions * 2);
    const growth_potential = Math.min(100, toolsActivated * 7);
    const investor_readiness = Math.min(100, jobs.filter((j) => j.type === 'INVESTOR_DECK' || j.type === 'PITCH_DECK').length * 30);

    const overall = Math.round(
      (digital_presence * 0.2 +
        marketing_reach * 0.2 +
        financial_clarity * 0.2 +
        operational_efficiency * 0.15 +
        growth_potential * 0.15 +
        investor_readiness * 0.1),
    );

    const recommendations: string[] = [];
    if (digital_presence < 40) recommendations.push('Set up your digital storefront in Brand & Digital Home');
    if (marketing_reach < 20) recommendations.push('Launch your first campaign in Marketing Automation');
    if (financial_clarity < 20) recommendations.push('Generate a business plan or financial forecast in BizIntel');
    if (investor_readiness < 10) recommendations.push('Build your investor deck in Investor Readiness Suite');
    if (toolsActivated < 5) recommendations.push('Activate more tools — upgrade to PlanAI Pro to unlock all 13');

    return {
      userId,
      overall,
      dimensions: {
        digital_presence,
        marketing_reach,
        financial_clarity,
        operational_efficiency,
        growth_potential,
        investor_readiness,
      },
      recommendations,
      toolsActivated,
      computedAt: new Date().toISOString(),
    };
  }

  // ─── Monthly digest ──────────────────────────────────────────────────────────
  async getMonthlyDigest(userId: string, dto: MonthlyDigestDto) {
    // … unchanged (same logic as original)
    const now = new Date();
    const month = dto.month ?? now.getMonth() + 1;
    const year = dto.year ?? now.getFullYear();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [jobsRun, ordersReceived, paymentsReceived, tasksCompleted] = await Promise.all([
      this.prisma.planAIJob.count({ where: { userId, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.order.count({ where: { store: { userId }, createdAt: { gte: startDate, lte: endDate } } }),
      this.prisma.payment.aggregate({ where: { userId, status: 'SUCCESS', paidAt: { gte: startDate, lte: endDate } }, _sum: { amountNGN: true } }),
      this.prisma.task.count({ where: { createdById: userId, status: 'DONE', completedAt: { gte: startDate, lte: endDate } } }),
    ]);

    const revenueNGN = (paymentsReceived._sum.amountNGN ?? 0) / 100;

    return {
      period: { month, year, label: startDate.toLocaleString('en-NG', { month: 'long', year: 'numeric' }) },
      summary: { jobsRun, ordersReceived, revenueNGN, tasksCompleted },
      highlights: this.buildDigestHighlights({ jobsRun, ordersReceived, revenueNGN, tasksCompleted }),
    };
  }

  private buildDigestHighlights(data: {
    jobsRun: number;
    ordersReceived: number;
    revenueNGN: number;
    tasksCompleted: number;
  }): string[] {
    const highlights: string[] = [];
    if (data.jobsRun > 0) highlights.push(`You ran ${data.jobsRun} AI job${data.jobsRun > 1 ? 's' : ''} this month`);
    if (data.ordersReceived > 0) highlights.push(`Your store received ${data.ordersReceived} order${data.ordersReceived > 1 ? 's' : ''}`);
    if (data.revenueNGN > 0) highlights.push(`₦${data.revenueNGN.toLocaleString('en-NG')} processed through your PlanAI tools`);
    if (data.tasksCompleted > 0) highlights.push(`You completed ${data.tasksCompleted} task${data.tasksCompleted > 1 ? 's' : ''} in Project Manager`);
    if (highlights.length === 0) highlights.push('No activity this month — let\'s get your first tool running!');
    return highlights;
  }

  // ─── Pricing ─────────────────────────────────────────────────────────────────
  getPricingTable() {
    return Object.entries(PLANAI_PRICING).map(([tier, kobo]) => ({
      tier,
      monthlyNGN: kobo / 100,
      tools: this.getAccessibleTools(tier as SubscriptionTier).length,
      label: tier === 'FREE' ? 'Free — 3 tools'
        : tier === 'STARTER' ? 'Starter — ₦9,500/mo — 6 tools'
        : tier === 'PRO' ? 'Pro — ₦25,000/mo — All 13 tools'
        : tier === 'AGENCY' ? 'Agency — ₦60,000/mo — All tools + white-label'
        : 'Enterprise — Custom',
    }));
  }

  // ─── Industry bundle ─────────────────────────────────────────────────────────
  getIndustryBundle(bundle: IndustryBundle) {
    return {
      bundle,
      tools: INDUSTRY_BUNDLES[bundle],
      description: this.bundleDescription(bundle),
    };
  }

  private bundleDescription(bundle: IndustryBundle): string {
    const descriptions: Record<IndustryBundle, string> = {
      restaurant: 'Social media, storefront, CRM, and campaigns — everything a restaurant needs to fill tables',
      fashion: 'Brand identity, social presence, marketplace, and paid ads — built for fashion entrepreneurs',
      tech: 'Business intelligence, investor tools, project management, and CRM — for tech founders',
      beauty: 'Content, ads, branding, and campaigns — grow your beauty business online',
      retail: 'Storefront, marketplace, CRM, and HR — run your retail operation end to end',
      agency: 'Ads, social, CRM, projects, and lead discovery — run your agency like a machine',
    };
    return descriptions[bundle];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW METHODS (aligned with PlanAISuiteController)
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Job management (simple passthrough to Prisma) ────────────────────────────
  async getUserJobs(userId: string, tool?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { userId, ...(tool ? { tool } : {}) };

    const [jobs, total] = await Promise.all([
      this.prisma.planAIJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, type: true, status: true, productSlug: true,
          outputFileUrl: true, errorMessage: true, processingMs: true,
          createdAt: true, completedAt: true,
        },
      }),
      this.prisma.planAIJob.count({ where }),
    ]);

    return {
      data: jobs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 },
    };
  }

  async getJob(jobId: string, userId: string) {
    const job = await this.prisma.planAIJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('Job not found');
    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      output: job.output as Record<string, unknown> | undefined,
      outputFileUrl: job.outputFileUrl ?? undefined,
      error: job.errorMessage ?? undefined,
      processingMs: job.processingMs ?? undefined,
    };
  }

  // ── Tool 1: Business Planning ────────────────────────────────────────────────
  async generateBusinessPlan(userId: string, body: any) {
    await this.assertToolAccess(userId, 'business-intelligence'); // or appropriate tool slug
    const result = await this.ai.generateJson<{ plan: any }>(
      'You are a Nigerian business plan consultant. Output valid JSON.',
      `Create a detailed business plan for: ${JSON.stringify(body)}. Include executive summary, market analysis, financial projections.`,
      { task: 'reasoning' },
    );

    // Save job record
    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.BUSINESS_PLAN,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.BUSINESS_PLAN, ...result.content };
  }

  // ── Tool 2: Financial Forecasting ────────────────────────────────────────────
  async generateFinancialForecast(userId: string, body: any) {
    await this.assertToolAccess(userId, 'business-intelligence');
    const result = await this.ai.generateJson<{ forecast: any }>(
      'You are a Nigerian financial analyst. Output valid JSON.',
      `Generate a 12-month financial forecast for: ${JSON.stringify(body)}. Include revenue, expenses, profit, cash flow.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.FINANCIAL_FORECAST,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.FINANCIAL_FORECAST, ...result.content };
  }

  // ── Tool 3: Brand Kit ────────────────────────────────────────────────────────
  async generateBrandKit(userId: string, body: any) {
    await this.assertToolAccess(userId, 'brand-digital-home');
    const result = await this.ai.generateJson<{ brandKit: any }>(
      'You are a Nigerian branding expert. Output valid JSON.',
      `Create a complete brand kit for: ${JSON.stringify(body)}. Include colour palette, typography, voice, logo ideas.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.BRANDING_PACKAGE,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.BRANDING_PACKAGE, ...result.content };
  }

  // ── Tool 4: Marketing Copy ───────────────────────────────────────────────────
  async generateMarketingCopy(userId: string, body: any) {
    await this.assertToolAccess(userId, 'marketing-automation');
    const result = await this.ai.generateNigerianContent(
      'You are a Nigerian marketing guru. Write compelling copy.',
      body.language ?? 'english',
      `Write marketing copy for: ${JSON.stringify(body)}`,
      { task: 'fast-chat', temperature: 0.8 },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.MARKETING_CAMPAIGN,
        status: 'COMPLETED',
        input: body,
        output: { copy: result.content } as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.MARKETING_CAMPAIGN, copy: result.content };
  }

  // ── Tool 5: Credibility Content ──────────────────────────────────────────────
  async generateCredibilityContent(userId: string, body: any) {
    await this.assertToolAccess(userId, 'brand-digital-home');
    const result = await this.ai.generateJson<{ content: any }>(
      'You are a personal branding expert for Nigerian professionals. Output valid JSON.',
      `Create credibility content (LinkedIn profile, resume, portfolio) for: ${JSON.stringify(body)}.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.CREDIBILITY_HUB,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.CREDIBILITY_HUB, ...result.content };
  }

  // ── Tool 6: Investor Docs ────────────────────────────────────────────────────
  async generateInvestorDocs(userId: string, body: any) {
    await this.assertToolAccess(userId, 'investor-readiness');
    const result = await this.ai.generateJson<{ docs: any }>(
      'You are a Nigerian investment advisor. Output valid JSON.',
      `Generate investor-ready documents (pitch deck, SAFE, data room) for: ${JSON.stringify(body)}.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.INVESTOR_DECK,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.INVESTOR_DECK, ...result.content };
  }

  // ── Tool 7: HR Content ───────────────────────────────────────────────────────
  async generateHRContent(userId: string, body: any) {
    await this.assertToolAccess(userId, 'hr-payroll'); // adjust slug accordingly
    const result = await this.ai.generateJson<{ hrDocs: any }>(
      'You are a Nigerian HR consultant. Output valid JSON.',
      `Generate HR documents (employee handbook, contract, leave policy) for: ${JSON.stringify(body)}.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.HR_DOCS, // ensure this exists in enum, else use a generic type
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: 'hr', ...result.content };
  }

  // ── Tool 8: Legal Templates ──────────────────────────────────────────────────
  async generateLegalTemplate(userId: string, body: any) {
    await this.assertToolAccess(userId, 'brand-digital-home');
    const result = await this.ai.generateNigerianContent(
      'You are a Nigerian legal practitioner. Draft legally compliant templates.',
      'english',
      `Generate legal template for: ${JSON.stringify(body)}`,
      { task: 'reasoning', temperature: 0.4 },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.LEGAL,
        status: 'COMPLETED',
        input: body,
        output: { template: result.content } as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: 'legal', template: result.content };
  }

  // ── Tool 9: Storefront Content ───────────────────────────────────────────────
  async generateStorefrontContent(userId: string, body: any) {
    await this.assertToolAccess(userId, 'brand-digital-home');
    const result = await this.ai.generateJson<{ productDescriptions: any }>(
      'You are a Nigerian e‑commerce copywriter. Output valid JSON.',
      `Generate product descriptions and store copy for: ${JSON.stringify(body)}.`,
      { task: 'fast-chat' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.STOREFRONT_SETUP,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.STOREFRONT_SETUP, ...result.content };
  }

  // ── Tool 10: Analytics Insights ──────────────────────────────────────────────
  async generateAnalyticsInsights(userId: string, body: any) {
    await this.assertToolAccess(userId, 'business-intelligence');
    const result = await this.ai.generateJson<{ insights: any }>(
      'You are a Nigerian data analyst. Output valid JSON.',
      `Analyze this analytics data and provide actionable insights: ${JSON.stringify(body)}.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.ANALYTICS_REPORT,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.ANALYTICS_REPORT, ...result.content };
  }

  // ── Tool 11: Operations Doc ──────────────────────────────────────────────────
  async generateOperationsDoc(userId: string, body: any) {
    await this.assertToolAccess(userId, 'business-intelligence');
    const result = await this.ai.generateJson<{ operationsDoc: any }>(
      'You are a Nigerian business operations consultant. Output valid JSON.',
      `Create SOPs, KPIs, and org charts for: ${JSON.stringify(body)}.`,
      { task: 'reasoning' },
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.OPERATIONS_DOC,
        status: 'COMPLETED',
        input: body,
        output: result.content as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: 'operations', ...result.content };
  }

  // ── Tool 12: Email Enrichment ────────────────────────────────────────────────
  async enrichLeadData(userId: string, leads: any[]) {
    await this.assertToolAccess(userId, 'business-discovery');
    const results = await Promise.all(
      leads.map(async (lead) => {
        const result = await this.ai.generateJson<{ enriched: any }>(
          'You are a B2B data enricher. Output valid JSON.',
          `Enrich this lead: ${JSON.stringify(lead)}. Add company size, industry, LinkedIn, etc.`,
          { task: 'fast-chat', temperature: 0.2 },
        );
        return { ...lead, ...result.content.enriched };
      }),
    );

    await this.prisma.planAIJob.create({
      data: {
        userId,
        type: PlanAIJobType.EMAIL_SCRAPE,
        status: 'COMPLETED',
        input: { count: leads.length },
        output: { enriched: results } as any,
        completedAt: new Date(),
        productSlug: 'planai',
      },
    });

    return { type: PlanAIJobType.EMAIL_SCRAPE, enriched: results };
  }
}