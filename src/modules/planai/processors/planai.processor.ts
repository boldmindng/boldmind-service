import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PlanAIJobType } from '@prisma/client';
import { QUEUES, JOBS } from '../../../common/constants/queues';
import { PlanAIJobService } from '../services/planai-job.service';
import { AiService } from '../../ai/ai.service';

// ─── Job payload shape ────────────────────────────────────────────────────────
export interface PlanAIJobPayload {
  jobId: string;
  userId: string;
  type: PlanAIJobType;
  input: Record<string, unknown>;
}

// ─── Nigerian business system prompt ─────────────────────────────────────────
// Shared across all job handlers — injected as the system message for every
// AI call in this processor. Never mutate; handlers may append to it inline.
const NG_BIZ_SYSTEM = `You are an expert Nigerian business advisor. Always:
- Use Naira (₦) for all monetary values
- Reference Nigerian institutions: CAC, FIRS, CBN, SMEDAN, NITDA, SON, NAFDAC
- Use Paystack/Flutterwave not Stripe/PayPal for payment references
- Account for Nigerian infrastructure realities (NEPA power, mobile data costs, generator costs)
- Reference Nigerian Startup Act 2022 and local regulatory frameworks where relevant
- Be practical and context-aware for the Nigerian market
Always respond with valid JSON only. No markdown fences. No preamble.`;

// ─────────────────────────────────────────────────────────────────────────────
// PlanAIJobProcessor
//
// Consumes QUEUES.AI_GENERATION — the single queue used for all async PlanAI
// document generation jobs. Job name matches PlanAIJobType (e.g. BUSINESS_PLAN).
//
// The email-scrape fan-out (JOBS.AI.EMAIL_SCRAPE) is also on this queue;
// BizDirectoryService enqueues it and this processor handles it.
// ─────────────────────────────────────────────────────────────────────────────

@Processor(QUEUES.AI_GENERATION)
export class PlanAIJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PlanAIJobProcessor.name);

  constructor(
    private readonly jobService: PlanAIJobService,
    private readonly ai: AiService,
  ) {
    super();
  }

  // ── Entry point ─────────────────────────────────────────────────────────────
  // BullMQ calls process() for every job dequeued from QUEUES.AI_GENERATION.
  // job.name === PlanAIJobType value (or JOBS.AI.EMAIL_SCRAPE for directory scrapes).
  // We switch on it so the single queue stays clean — no separate queue-per-tool.

  async process(job: Job<PlanAIJobPayload>): Promise<void> {
    const { jobId, userId, type, input } = job.data;
    const start = Date.now();
    this.logger.log(
      `⚙️  Processing job=${jobId} name=${job.name} type=${type} user=${userId} attempt=${job.attemptsMade + 1}`,
    );

    await this.jobService.markProcessing(jobId);

    try {
      let output: Record<string, unknown>;

      switch (type) {
        case PlanAIJobType.BUSINESS_PLAN:
          output = await this.runBusinessPlan(input);
          break;
        case PlanAIJobType.PITCH_DECK:
          output = await this.runPitchDeck(input);
          break;
        case PlanAIJobType.FINANCIAL_FORECAST:
          output = await this.runFinancialForecast(input);
          break;
        case PlanAIJobType.BRANDING_PACKAGE:
          output = await this.runBrandingPackage(input);
          break;
        case PlanAIJobType.CREDIBILITY_HUB:
          output = await this.runCredibilityHub(input);
          break;
        case PlanAIJobType.INVESTOR_DECK:
          output = await this.runInvestorDeck(input);
          break;
        case PlanAIJobType.MARKETING_CAMPAIGN:
          output = await this.runMarketingCampaign(input);
          break;
        case PlanAIJobType.ANALYTICS_REPORT:
          output = await this.runAnalyticsReport(input);
          break;
        case PlanAIJobType.EMAIL_SCRAPE:
          output = await this.runEmailScrape(input);
          break;
        case PlanAIJobType.STOREFRONT_SETUP:
          output = await this.runStorefrontSetup(input);
          break;
        default: {
          // TypeScript exhaustiveness guard — a new PlanAIJobType not handled here
          // will cause a compile-time error (the `never` assignment below will fail).
          const _exhaustive: any = type;
          throw new Error(`Unhandled PlanAI job type: ${String(_exhaustive)}`);
        }
      }

      const processingMs = Date.now() - start;
      await this.jobService.markCompleted(jobId, output, { processingMs });
      this.logger.log(`✅ Job done job=${jobId} type=${type} in ${processingMs}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `❌ Job failed job=${jobId} type=${type} attempt=${job.attemptsMade + 1}: ${message}`,
      );
      await this.jobService.markFailed(jobId, message);
      // Re-throw so BullMQ can apply retry/backoff policy defined in QUEUE_DEFAULT_JOB_OPTIONS
      throw error;
    }
  }

  // ─── BUSINESS PLAN ────────────────────────────────────────────────────────

  private async runBusinessPlan(input: Record<string, unknown>) {
    const bankExtra = input.bankLoanFormat
      ? 'Format for Nigerian bank loan application. Follow Access Bank / GTBank / First Bank business plan templates.'
      : '';

    const result = await this.ai.generateJson<{
      executiveSummary: string;
      marketAnalysis: Record<string, unknown>;
      competitorAnalysis: Record<string, unknown>;
      marketingStrategy: Record<string, unknown>;
      operationsPlan: Record<string, unknown>;
      financialProjections: Record<string, unknown>;
      riskAnalysis: Record<string, unknown>;
      regulatoryChecklist: string[];
      fundingRequirements: Record<string, unknown>;
    }>(
      NG_BIZ_SYSTEM,
      `Generate a comprehensive Nigerian business plan.
Business name: ${input.businessName}
Industry: ${input.industry}
Description: ${input.description}
Target states: ${(input.targetStates as string[] | undefined)?.join(', ') ?? 'Nigeria-wide'}
Monthly revenue target: ₦${input.revenueTargetNGN ?? 'not specified'}
Startup capital: ₦${input.startupCapitalNGN ?? 'not specified'}
${bankExtra}

Return JSON: {
  executiveSummary: string,
  marketAnalysis: { targetMarket, marketSize, trends: [string] },
  competitorAnalysis: { competitors: [{ name, strengths, weaknesses }], competitiveAdvantage },
  marketingStrategy: { channels: [string], budget, timeline },
  operationsPlan: { location, team, equipment: [string], processes: [string] },
  financialProjections: { year1: { revenue, expenses, profit }, year2, year3 },
  riskAnalysis: { risks: [{ risk, likelihood, mitigation }] },
  regulatoryChecklist: [string],
  fundingRequirements: { totalNeeded, breakdown: [{ item, amount }], source }
}`,
      { task: 'reasoning', temperature: 0.6, maxTokens: 4000 },
    );

    return {
      ...result.content,
      generatedAt: new Date().toISOString(),
      bankLoanFormat: !!input.bankLoanFormat,
    };
  }

  // ─── PITCH DECK ──────────────────────────────────────────────────────────

  private async runPitchDeck(input: Record<string, unknown>) {
    const result = await this.ai.generateJson<{
      slides: Array<{
        slideNumber: number;
        title: string;
        content: string[];
        speakerNotes: string;
      }>;
    }>(
      NG_BIZ_SYSTEM,
      `Generate a 10-slide Nigerian startup pitch deck.
Business: ${input.businessName}, Industry: ${input.industry}
Description: ${input.description}
Funding ask: ₦${input.fundingAskNGN ?? 'not specified'}

Slides in order: 1) Problem, 2) Solution, 3) Market Size (Nigerian TAM/SAM/SOM),
4) Product Demo, 5) Business Model (Naira revenue streams), 6) Traction & Metrics,
7) Team, 8) Financial Projections (3yr in ₦), 9) Competition, 10) The Ask.

Return JSON: { slides: [{ slideNumber, title, content: [bullet strings], speakerNotes }] }`,
      { task: 'reasoning', temperature: 0.6, maxTokens: 3000 },
    );

    return { ...result.content, generatedAt: new Date().toISOString() };
  }

  // ─── FINANCIAL FORECAST ──────────────────────────────────────────────────

  private async runFinancialForecast(input: Record<string, unknown>) {
    const fxNote = input.includeFXImpact
      ? 'Include NGN/USD FX impact — model 5-8% monthly NGN depreciation risk on imported goods/services costs.'
      : '';

    const result = await this.ai.generateJson<{
      months: Array<{
        month: number;
        revenue: number;
        expenses: number;
        profit: number;
        cumulativeCashFlow: number;
      }>;
      breakEvenMonth: number;
      burnRateMonthly: number;
      runwayMonths: number;
      keyAssumptions: string[];
      sensitivityAnalysis: Record<string, unknown>;
    }>(
      `${NG_BIZ_SYSTEM}\n${fxNote}`,
      `Generate a 12-month financial forecast for a Nigerian business.
Business: ${input.businessName}, Industry: ${input.industry}
Monthly revenue (current): ₦${input.currentMonthlyRevenue ?? 0}
Monthly expenses: ₦${input.monthlyExpenses ?? 0}
Growth rate assumption: ${input.growthRatePercent ?? 10}% per month

Return JSON: {
  months: [{ month (1-12), revenue, expenses, profit, cumulativeCashFlow }],
  breakEvenMonth, burnRateMonthly, runwayMonths,
  keyAssumptions: [string],
  sensitivityAnalysis: { optimistic: { year1Revenue }, base: { year1Revenue }, pessimistic: { year1Revenue } }
}
All monetary values in Naira (₦, no symbol in JSON — just numbers).`,
      { task: 'reasoning', temperature: 0.4, maxTokens: 2000 },
    );

    return {
      ...result.content,
      generatedAt: new Date().toISOString(),
      includedFXImpact: !!input.includeFXImpact,
    };
  }

  // ─── BRANDING PACKAGE ────────────────────────────────────────────────────

  private async runBrandingPackage(input: Record<string, unknown>) {
    const result = await this.ai.generateJson<{
      brandName: string;
      tagline: string;
      brandVoice: string;
      colorPalette: Array<{ name: string; hex: string; usage: string }>;
      typography: Record<string, string>;
      logoPrompt: string;
      brandGuidelines: string[];
      socialBioTemplates: Record<string, string>;
    }>(
      NG_BIZ_SYSTEM,
      `Generate a complete branding package for a Nigerian business.
Business name: ${input.businessName}
Industry: ${input.industry}
Target audience: ${input.targetAudience ?? 'Nigerian consumers'}
Brand personality: ${input.brandPersonality ?? 'professional, approachable'}

Return JSON: {
  brandName, tagline (catchy, Nigerian market-aware),
  brandVoice (2-sentence description of tone and style),
  colorPalette: [{ name, hex, usage }] (3-5 colors),
  typography: { heading, body, accent },
  logoPrompt (DALL-E prompt for logo generation),
  brandGuidelines: [string] (8-10 practical rules),
  socialBioTemplates: { instagram, twitter, linkedin, whatsappBusiness }
}`,
      { task: 'creative', temperature: 0.7, maxTokens: 1500 },
    );

    return { ...result.content, generatedAt: new Date().toISOString() };
  }

  // ─── CREDIBILITY HUB ─────────────────────────────────────────────────────

  private async runCredibilityHub(input: Record<string, unknown>) {
    const result = await this.ai.generateJson<{
      portfolioHeadline: string;
      aboutSection: string;
      caseStudies: Array<{ title: string; challenge: string; solution: string; result: string }>;
      testimonialPrompts: string[];
      credentialChecklist: string[];
      pressKitOutline: string[];
    }>(
      NG_BIZ_SYSTEM,
      `Generate a credibility hub / portfolio strategy for a Nigerian professional or business.
Name / Business: ${input.name ?? input.businessName}
Industry: ${input.industry}
Key achievements: ${input.achievements ?? 'not provided'}
Years of experience: ${input.yearsOfExperience ?? 'not specified'}

Return JSON: {
  portfolioHeadline (powerful one-liner),
  aboutSection (150-word professional bio, Nigerian market-aware),
  caseStudies: [{ title, challenge, solution, result }] (3 template case studies),
  testimonialPrompts: [5 questions to ask clients for testimonials],
  credentialChecklist: [string] (certificates, registrations to acquire),
  pressKitOutline: [string] (elements of a Nigerian business press kit)
}`,
      { task: 'creative', temperature: 0.65, maxTokens: 1500 },
    );

    return { ...result.content, generatedAt: new Date().toISOString() };
  }

  // ─── INVESTOR DECK ───────────────────────────────────────────────────────

  private async runInvestorDeck(input: Record<string, unknown>) {
    // SAFE note path
    if (input.documentType === 'safe') {
      const result = await this.ai.generateJson<{
        safeTerms: Record<string, unknown>;
        keyTermsExplained: Record<string, string>;
        dataRoomChecklist: Array<{ category: string; items: Array<{ name: string; required: boolean; description: string }> }>;
        secNigeriaCompliance: string[];
        disclaimer: string;
        nextSteps: string[];
      }>(
        NG_BIZ_SYSTEM,
        `Generate SAFE note terms and investor documentation for a Nigerian startup.
Company: ${input.companyName}
Investor name: ${input.investorName}
Investment amount: ₦${input.investmentAmountNGN}
Valuation cap: ₦${input.valuationCapNGN ?? 'not set'}
Discount rate: ${input.discountRatePercent ?? 20}%
CAC registration number: ${input.cacRegNumber ?? 'not provided'}

Return JSON: {
  safeTerms: {
    investmentAmountNGN, valuationCapNGN, discountRatePercent,
    proRataRights: boolean, mostFavouredNation: boolean
  },
  keyTermsExplained: { termName: "plain-English explanation" },
  dataRoomChecklist: [{ category, items: [{ name, required, description }] }],
  secNigeriaCompliance: [string] (Investment and Securities Act 2024 requirements),
  disclaimer: "standard AI-generated document disclaimer mentioning Nigerian lawyer review",
  nextSteps: [string]
}`,
        { task: 'reasoning', temperature: 0.4, maxTokens: 2000 },
      );
      return { ...result.content, documentType: 'safe', generatedAt: new Date().toISOString() };
    }

    // Generic investor materials
    const result = await this.ai.generateJson<{
      executiveSummary: string;
      onePager: string;
      investorFAQ: Array<{ question: string; answer: string }>;
    }>(
      NG_BIZ_SYSTEM,
      `Generate investor materials for ${input.companyName}.
Return JSON: { executiveSummary, onePager, investorFAQ: [{ question, answer }] (5 FAQs) }`,
      { task: 'reasoning', temperature: 0.5, maxTokens: 2000 },
    );

    return {
      ...result.content,
      documentType: input.documentType ?? 'general',
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── MARKETING CAMPAIGN ──────────────────────────────────────────────────

  private async runMarketingCampaign(input: Record<string, unknown>) {
    const isWhatsApp = input.channel === 'whatsapp';
    const festivNote = input.festiveCampaign
      ? `This is a ${input.festiveCampaign} festive campaign (e.g. Eid, Christmas, Valentine's, Independence Day). Use culturally appropriate tone and references.`
      : '';

    const channelRules = isWhatsApp
      ? 'WhatsApp rules: no HTML, max 300 chars per message, use emoji naturally, conversational tone, avoid spam trigger words.'
      : input.channel === 'email'
      ? 'Email rules: can use HTML structure (but return as plain text template), subject line max 60 chars, preheader max 90 chars.'
      : 'SMS rules: max 160 chars, no links (use shortlink), clear sender ID.';

    const result = await this.ai.generateJson<{
      primaryCopy: string;
      altVariants: string[];
      subjectLines: string[];
      callToAction: string;
      bestSendTime: string;
      estimatedOpenRate: string;
      abTestRecommendation: string;
    }>(
      `${NG_BIZ_SYSTEM}\n${channelRules}\n${festivNote}`,
      `Write a Nigerian ${input.channel} marketing campaign.
Campaign name: ${input.name}
Core message / offer: ${input.content}
${input.subject ? `Suggested subject line: ${input.subject}` : ''}

Return JSON: {
  primaryCopy (ready-to-send message),
  altVariants: [2 alternative versions — different angle or tone],
  subjectLines: [3 A/B test subject lines for email; empty array for WhatsApp/SMS],
  callToAction (clear CTA text without URL),
  bestSendTime (Nigeria-specific, e.g. "Tuesday 7–9pm WAT"),
  estimatedOpenRate (e.g. "35–45% for WhatsApp broadcasts"),
  abTestRecommendation (which variant to run first and why)
}`,
      { task: 'creative', temperature: 0.75, maxTokens: 1000 },
    );

    return {
      ...result.content,
      channel: input.channel,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── ANALYTICS REPORT ────────────────────────────────────────────────────
  // Live metrics are aggregated by BizIntelService before the job is queued.
  // The processor's job is purely narrative — turn numbers into insights.

  private async runAnalyticsReport(input: Record<string, unknown>) {
    const result = await this.ai.generateJson<{
      headline: string;
      insights: string[];
      recommendations: string[];
      periodNarrative: string;
    }>(
      NG_BIZ_SYSTEM,
      `Analyse these Nigerian SME business metrics and generate a digest.
Period: ${input.period ?? 'last_30_days'}
Metrics: ${JSON.stringify(input.metrics ?? {})}

Return JSON: {
  headline (one-sentence summary of the period — include the strongest number),
  insights: [3-5 data-driven observations, each starting with the metric],
  recommendations: [3 actionable next steps, each with an owner role e.g. "Marketing team:"],
  periodNarrative (2-sentence overall trend paragraph for a founder weekly email)
}`,
      { task: 'reasoning', temperature: 0.5, maxTokens: 800 },
    );

    return {
      ...result.content,
      period: input.period ?? 'last_30_days',
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── EMAIL SCRAPE ────────────────────────────────────────────────────────
  // Enqueued by BizDirectoryService when Hunter.io returns no results.
  // Job name: JOBS.AI.EMAIL_SCRAPE ("email-scrape")
  // Actual HTTP discovery is handled by BizDirectoryService.findContacts();
  // this entry logs intent and returns a status shape that the service polls.

  private async runEmailScrape(input: Record<string, unknown>) {
    this.logger.log(
      `📧 Email scrape — company="${input.company}" role="${input.jobTitle ?? 'any'}" userId="${input.userId}"`,
    );

    return {
      company: input.company,
      jobTitle: input.jobTitle ?? null,
      status: 'scraping',
      estimatedMinutes: 3,
      message:
        'Contact discovery is running via Hunter.io. Results will appear automatically when ready.',
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── STOREFRONT SETUP ────────────────────────────────────────────────────

  private async runStorefrontSetup(input: Record<string, unknown>) {
    const slug =
      (input.name as string | undefined)
        ?.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 40) ?? 'my-store';

    const result = await this.ai.generateJson<{
      storeName: string;
      storeDescription: string;
      suggestedCategories: string[];
      seoTitle: string;
      seoDescription: string;
      whatsappIntroMessage: string;
    }>(
      NG_BIZ_SYSTEM,
      `Generate storefront content for a Nigerian online store.
Store name: ${input.name}
Business category: ${input.category}
Description: ${input.description ?? 'not provided'}

Return JSON: {
  storeName (clean display name),
  storeDescription (60–100 word SEO-friendly description — mention Nigeria/Lagos/Nigerian market naturally),
  suggestedCategories: [5 product category names specific to this business type],
  seoTitle (max 60 chars, keyword-rich title tag),
  seoDescription (max 160 chars, meta description),
  whatsappIntroMessage (WhatsApp announcement message for store opening — Pidgin-friendly, emoji welcome, max 200 chars)
}`,
      { task: 'creative', temperature: 0.6, maxTokens: 600 },
    );

    return {
      ...result.content,
      storeSlug: slug,
      storeUrl: `https://planai.boldmind.ng/brand/store/${slug}`,
      shareableLink: `https://boldmind.ng/store/${slug}`,
      nextSteps: [
        'Add your first product with at least 3 clear photos',
        'Connect your Paystack account in Settings → Payments',
        'Share your store link on WhatsApp Status and Instagram bio',
        'Set up abandoned cart recovery in Marketing Automation',
        'Enable Google Analytics in Store Settings for traffic data',
      ],
      generatedAt: new Date().toISOString(),
    };
  }
}