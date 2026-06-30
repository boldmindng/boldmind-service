import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { ConfigureAgentDto, AgentTaskDto } from '../dto/all-planai.dto';

// ═════════════════════════════════════════════════════════════════════════════
// AI BUSINESS AGENT SERVICE
// ═════════════════════════════════════════════════════════════════════════════
@Injectable()
export class BizAgentService {
  private readonly logger = new Logger(BizAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectQueue('ai-agent-tasks') private readonly agentQueue: Queue,
  ) {}

  async configureAgent(userId: string, dto: ConfigureAgentDto) {
    const existing = await this.prisma.receptionistClient.findUnique({ where: { userId } });

    const data = {
      businessContext: dto.businessContext,
      faqData: dto.faqData,
      autoReplyEnabled: true,
      appointmentEnabled: dto.appointmentEnabled ?? false,
      calendarUrl: dto.calendarUrl ?? null,
      escalationTriggers: [
        'refund', 'complaint', 'angry', 'manager', 'legal',
        ...(dto.faqData ? [] : []),
      ],
    };

    if (existing) {
      await this.prisma.receptionistClient.update({ where: { userId }, data });
    } else {
      await this.prisma.receptionistClient.create({
        data: {
          userId,
          businessName: dto.agentName ?? 'Business Assistant',
          ...data,
        },
      });
    }

    await this.logActivity(userId, 'agent.configured', { channels: dto.channels, language: dto.language });

    return {
      agentName: dto.agentName ?? 'Business Assistant',
      channels: dto.channels ?? ['whatsapp'],
      language: dto.language ?? 'english',
      appointmentEnabled: dto.appointmentEnabled ?? false,
      invoiceFollowUpEnabled: dto.invoiceFollowUpEnabled ?? false,
      status: 'active',
      nextSteps: (dto.channels ?? ['whatsapp']).map((c) =>
        c === 'whatsapp'
          ? 'Connect WhatsApp Business number in Settings → Integrations → WhatsApp'
          : `Connect ${c} in Settings → Integrations`,
      ),
    };
  }

  async getAgentStatus(userId: string) {
    const client = await this.prisma.receptionistClient.findUnique({
      where: { userId },
      select: {
        isActive: true, autoReplyEnabled: true, appointmentEnabled: true,
        monthlyMessageCount: true, totalLeadsCaptured: true,
        whatsappNumber: true, planTier: true,
      },
    });

    if (!client) return { configured: false, message: 'Configure your AI agent to get started.' };

    const cacheKey = `agent:stats:${userId}`;
    const cached = await this.redis.get(cacheKey);
    const stats = cached ? JSON.parse(cached) as Record<string, unknown> : null;

    return { configured: true, ...client, ...(stats ? { stats } : {}) };
  }

  async runTask(userId: string, dto: AgentTaskDto) {
    const client = await this.prisma.receptionistClient.findUnique({ where: { userId } });
    if (!client) throw new NotFoundException('AI Agent not configured. Set up your agent first.');

    await this.agentQueue.add(
      `agent-task-${dto.taskType}`,
      { userId, clientId: client.id, taskType: dto.taskType, payload: dto.payload },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.logActivity(userId, `agent.task.${dto.taskType}`, { payload: dto.payload });

    const messages: Record<string, string> = {
      invoice_followup: 'Invoice follow-up sequence queued. Agent will send polite reminders over the next 72 hours.',
      appointment_booking: 'Appointment booking flow activated on WhatsApp.',
      order_update: 'Order status update messages will be sent to customers automatically.',
      supplier_comms: 'Supplier communication templates activated.',
    };

    return { taskType: dto.taskType, status: 'queued', message: messages[dto.taskType] ?? 'Task queued.' };
  }

  async getAgentLogs(userId: string) {
    const [conversations, leads, tasks] = await Promise.all([
      this.prisma.conversationLog.findMany({
        where: { client: { userId } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          platform: true, status: true, senderName: true,
          leadScore: true, sentiment: true, createdAt: true, isEscalated: true,
        },
      }),
      this.prisma.leadCapture.count({ where: { client: { userId } } }),
      this.prisma.activityLog.count({ where: { userId, action: { startsWith: 'agent.task.' } } }),
    ]);

    return { recentConversations: conversations, totalLeads: leads, tasksRun: tasks };
  }

  // Generate a daily briefing for the business owner
  async getDailyBriefing(userId: string) {
    const [conversations, leads, orders] = await Promise.all([
      this.prisma.conversationLog.count({
        where: { client: { userId }, createdAt: { gte: new Date(Date.now() - 86400_000) } },
      }),
      this.prisma.leadCapture.count({
        where: { client: { userId }, createdAt: { gte: new Date(Date.now() - 86400_000) } },
      }),
      this.prisma.order.count({
        where: { store: { userId }, createdAt: { gte: new Date(Date.now() - 86400_000) } },
      }),
    ]);

    const result = await this.ai.generateNigerianContent(
      'You are a helpful Nigerian business AI assistant writing a daily briefing. Valid JSON only.',
      'english',
      `Write a friendly daily business briefing.
Stats from last 24 hours: ${conversations} customer conversations, ${leads} new leads, ${orders} new orders.

Return JSON: { greeting (Good morning/afternoon + motivational line), summary (2-sentence business summary), 
topPriority (what to focus on today), tip (one Nigerian business tip) }`,
      { task: 'fast-chat', temperature: 0.8, cacheTtl: 0 },
    );

    try {
      return JSON.parse(result.content) as Record<string, unknown>;
    } catch {
      return { greeting: 'Good morning!', summary: `${conversations} conversations, ${leads} leads, ${orders} orders yesterday.`, topPriority: 'Follow up on new leads', tip: 'Consistency is key for Nigerian business growth.' };
    }
  }

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'ai-business-agent', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}