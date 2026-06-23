import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { CreateContactDto, CreateDealDto } from '../dto/all-planai.dto';

// ═════════════════════════════════════════════════════════════════════════════
// CRM SERVICE
// ═════════════════════════════════════════════════════════════════════════════
@Injectable()
export class PlanCRMService {
  private readonly logger = new Logger(PlanCRMService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  // Contacts stored in activityLog until dedicated Contact model is added to schema.
  // This keeps the schema clean while building the CRM data model.

  async createContact(userId: string, dto: CreateContactDto) {
    const contactId = `contact_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await this.prisma.activityLog.create({
      data: { userId, action: 'crm.contact_created', productSlug: 'crm', metadata: { contactId, ...dto } },
    });
    return { id: contactId, ...dto, createdAt: new Date().toISOString() };
  }

  async getContacts(userId: string, search?: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, action: 'crm.contact_created' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const contacts = logs.map((l) => ({ ...(l.metadata as object), createdAt: l.createdAt }));
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const s = JSON.stringify(c).toLowerCase();
      return s.includes(q);
    });
  }

  async createDeal(userId: string, dto: CreateDealDto) {
    const dealId = `deal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await this.prisma.activityLog.create({
      data: { userId, action: 'crm.deal_created', productSlug: 'crm', metadata: { dealId, ...dto } },
    });
    return { id: dealId, ...dto, stage: dto.stage ?? 'NEW', createdAt: new Date().toISOString() };
  }

  async moveDeal(userId: string, dealId: string, newStage: string) {
    await this.prisma.activityLog.create({
      data: {
        userId, action: 'crm.deal_stage_changed', productSlug: 'crm',
        metadata: { dealId, newStage, changedAt: new Date().toISOString() },
      },
    });
    return { dealId, stage: newStage, updatedAt: new Date().toISOString() };
  }

  async getPipelineSummary(userId: string) {
    const cacheKey = `crm:pipeline:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const dealLogs = await this.prisma.activityLog.findMany({
      where: { userId, action: 'crm.deal_created' },
      select: { metadata: true },
    });

    const stages = ['NEW', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'];
    const pipeline = Object.fromEntries(
      stages.map((s) => [s, { count: 0, totalNGN: 0 }]),
    ) as Record<string, { count: number; totalNGN: number }>;

    dealLogs.forEach((l) => {
      const m = l.metadata as Record<string, unknown>;
      const stage = (m.stage as string) ?? 'NEW';
      const value = (m.valueNGN as number) ?? 0;
      if (pipeline[stage]) {
        pipeline[stage].count++;
        pipeline[stage].totalNGN += value;
      }
    });

    const totalWonNGN = pipeline['WON']?.totalNGN ?? 0;
    const totalDeals = dealLogs.length;
    const wonDeals = pipeline['WON']?.count ?? 0;
    const winRate = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;

    const result = { pipeline, totalDeals, totalWonNGN, winRate };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getAINextAction(userId: string, contactId: string) {
    // In production: analyse conversation logs + payment history + interaction recency
    const recentLogs = await this.prisma.activityLog.findMany({
      where: { userId, action: { startsWith: 'crm.' }, metadata: { path: ['contactId'], equals: contactId } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const result = await this.ai.generateJson<{
      action: string; priority: string; reasoning: string; talkingPoint: string;
    }>(
      'You are a Nigerian B2B sales coach. Valid JSON only.',
      `Suggest the next best action for a sales contact.
Contact ID: ${contactId}
Recent interactions: ${recentLogs.length} logged actions.

Return JSON: { action (CALL|EMAIL|WHATSAPP|MEETING|PROPOSAL|FOLLOW_UP), priority (HIGH|MEDIUM|LOW),
reasoning (1 sentence why this action now), talkingPoint (opening line in Nigerian business context) }`,
      { task: 'fast-chat', temperature: 0.7, cacheTtl: 3600 },
    );

    return result.content;
  }

  async getChurnRisk(userId: string) {
    // Customers who haven't ordered in 60+ days
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const atRisk = await this.prisma.order.findMany({
      where: { store: { userId }, createdAt: { lt: sixtyDaysAgo } },
      select: { customerEmail: true, customerName: true, createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
      distinct: ['customerEmail'],
    });

    return {
      atRisk: atRisk.map((o) => ({
        ...o,
        daysSinceOrder: Math.floor((Date.now() - o.createdAt.getTime()) / 86400_000),
        totalValueNGN: o.totalAmount / 100,
      })),
      tip: 'Send a winback campaign to customers who haven\'t bought in 60+ days.',
    };
  }
}