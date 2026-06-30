
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { PlanAIJobService } from './planai-job.service';
import { GenerateSafeDto, DataRoomDto } from '../dto/all-planai.dto';
import { PlanAIJobType } from '@prisma/client';

@Injectable()
export class InvestorKitService {
  private readonly logger = new Logger(InvestorKitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly jobService: PlanAIJobService,
  ) {}

  async generateSafe(userId: string, dto: GenerateSafeDto) {
    return this.jobService.createJob(userId, {
      type: PlanAIJobType.INVESTOR_DECK,
      input: { ...dto, documentType: 'safe' },
      productSlug: 'investor-readiness',
    });
  }

  async generateCapTable(userId: string, input: {
    founders: Array<{ name: string; sharesPercent: number }>;
    investors?: Array<{ name: string; amount: number; equity: number }>;
    optionPool?: number;
  }) {
    const total = [
      ...input.founders.map((f) => f.sharesPercent),
      ...(input.investors?.map((i) => i.equity) ?? []),
      input.optionPool ?? 0,
    ].reduce((a, b) => a + b, 0);

    await this.logActivity(userId, 'investor.captable_generated', {});

    return {
      founders: input.founders,
      investors: input.investors ?? [],
      optionPool: input.optionPool ?? 0,
      totalAllocated: Math.round(total * 100) / 100,
      warning: total > 100 ? 'Total equity exceeds 100% — please review your cap table' : null,
    };
  }

  async setupDataRoom(userId: string, dto: DataRoomDto) {
    const sections = dto.sections ?? ['financials', 'legal', 'team', 'product', 'market', 'pitch'];
    const dataRoomId = `dr_${Date.now().toString(36)}`;

    await this.logActivity(userId, 'investor.dataroom_created', {
      dataRoomId,
      startupName: dto.startupName,
    });

    return {
      dataRoomId,
      startupName: dto.startupName,
      sections: sections.map((s) => ({
        section: s,
        folderName: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        requiredDocuments: this.getRequiredDocs(s),
        status: 'empty',
      })),
      shareUrl: `https://planai.boldmind.ng/investor/dataroom/${dataRoomId}`,
      tip: 'Share this link with investors. They can request access and you approve each one.',
    };
  }

  async getVCTracker() {
    const cacheKey = 'investor:vc_tracker:ng';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const data = {
      vcs: [
        { name: 'Ventures Platform', focus: 'Early-stage Nigerian startups', stage: 'Pre-seed to Series A', activelyInvesting: true, website: 'venturesplatform.com' },
        { name: 'Kepple Africa Ventures', focus: 'African tech', stage: 'Seed', activelyInvesting: true, website: 'kepple-africa.com' },
        { name: 'Y Combinator', focus: 'Global — strong Nigerian alumni network', stage: 'Pre-seed', activelyInvesting: true, website: 'ycombinator.com' },
        { name: 'TLcom Capital', focus: 'Sub-Saharan Africa', stage: 'Seed to Series B', activelyInvesting: true, website: 'tlcomcapital.com' },
        { name: 'Future Africa', focus: 'Africa', stage: 'Pre-seed', activelyInvesting: true, website: 'future.africa' },
        { name: 'Ingressive Capital', focus: 'African tech talent companies', stage: 'Pre-seed to Seed', activelyInvesting: true, website: 'ingressive.capital' },
        { name: 'Microtraction', focus: 'Africa pre-seed', stage: 'Pre-seed', activelyInvesting: true, website: 'microtraction.com' },
      ],
      grants: [
        { name: 'SMEDAN Business Grants', body: 'SMEDAN', maxAmount: '₦5,000,000', deadline: 'Rolling', type: 'grant' },
        { name: 'BOI Youth Entrepreneurship', body: 'Bank of Industry', maxAmount: '₦5,000,000', type: 'loan', rate: '9% p.a.' },
        { name: 'Tony Elumelu Foundation', body: 'TEF', maxAmount: '$5,000 USD', deadline: 'Annual (March)', type: 'grant+mentorship' },
        { name: 'Jack Ma Africa Netpreneur Prize', body: 'ANAP', maxAmount: '$1,000,000 USD (total pool)', type: 'competition' },
      ],
      updatedAt: new Date().toISOString(),
    };

    await this.redis.setex(cacheKey, 86400, JSON.stringify(data));
    return data;
  }

  async generateInvestorUpdate(userId: string, input: {
    companyName: string;
    period: string;
    metrics: Record<string, unknown>;
    highlights: string[];
    challenges: string[];
    ask?: string;
  }) {
    const result = await this.ai.generateJson<{
      subject: string;
      body: string;
      summary: string;
    }>(
      'You are a startup communications expert for Nigerian founders. Valid JSON only.',
      `Write a professional investor update email for a Nigerian startup.
Company: ${input.companyName}, Period: ${input.period}
Key metrics: ${JSON.stringify(input.metrics)}
Highlights: ${input.highlights.join(', ')}
Challenges: ${input.challenges.join(', ')}
Ask: ${input.ask ?? 'introductions to Series A investors'}

Return JSON: { subject (email subject line), body (full HTML email, professional yet warm), 
summary (3-sentence WhatsApp-ready version) }`,
      { task: 'creative', temperature: 0.6 },
    );

    await this.logActivity(userId, 'investor.update_generated', { period: input.period });
    return result.content;
  }

  private getRequiredDocs(section: string): string[] {
    const docs: Record<string, string[]> = {
      financials: ['P&L Statement (last 12 months)', 'Balance Sheet', 'Cash Flow Statement', '3-year Projections', 'Bank Statements'],
      legal:      ['CAC Certificate of Incorporation', 'CAC Form CAC 1.1', 'Shareholders Agreement', 'IP Registrations', 'Material Contracts'],
      team:       ['Founder CVs/LinkedIn', 'Org Chart', 'Key Employee Offer Letters', 'Advisory Board Profiles'],
      product:    ['Product Demo Video/Recording', 'Technical Architecture', 'Product Roadmap', 'User Metrics Dashboard Screenshot'],
      market:     ['Market Size Analysis (TAM/SAM/SOM)', 'Competitor Landscape', 'Customer Research/Interviews', 'GTM Strategy'],
      pitch:      ['Investor Pitch Deck', 'Executive Summary (1-pager)', 'Company One-Pager'],
    };
    return docs[section] ?? [];
  }

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'investor-readiness', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}