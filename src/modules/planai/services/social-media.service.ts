import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service';
import { AiService } from '../../ai/ai.service';
import { MetaWebhookService } from '../social-media-manager/metawebhook.service';
import * as crypto from 'crypto';
import { FalProvider, GenerateImageOptions, GenerateVideoOptions } from '../../ai/providers/fal.provider';
import { SubscriptionTier } from '@prisma/client';

// Per-tier limits (null = unlimited)
const TIER_LIMITS: Record<SubscriptionTier, { images: number | null; videos: number | null }> = {
  FREE:       { images: 50,   videos: 10   },
  STARTER:    { images: 200,  videos: 30   },
  PRO:        { images: 1000, videos: 100  },
  AGENCY:     { images: null, videos: null },
  ENTERPRISE: { images: null, videos: null },
};

// Models restricted to certain tiers
const PRO_ONLY_MODELS = ['wan-pro', 'luma-dream-machine'];
const STARTER_PLUS_MODELS = ['kling-video-v2-master'];


@Injectable()
export class SocialMediaService {
  private readonly logger = new Logger(SocialMediaService.name);

  constructor(
    private readonly fal: FalProvider,
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly meta: MetaWebhookService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  // ── Verify webhook (GET) ──────────────────────────────────

  verifyWebhook(mode: string, token: string, challenge: string): string {
    const verifyToken = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) return challenge;
    throw new BadRequestException('Webhook verification failed');
  }

  // ── Handle incoming webhook event (POST) ──────────────────

  async handleWebhookEvent(signature: string, body: any): Promise<void> {
    // Verify Meta signature
    const appSecret = this.config.get<string>('META_APP_SECRET');
    const hash = crypto.createHmac('sha256', appSecret).update(JSON.stringify(body)).digest('hex');
    if (signature !== `sha256=${hash}`) {
      throw new BadRequestException('Invalid Meta signature');
    }

    const { object, entry } = body;
    for (const entryItem of entry || []) {
      for (const change of entryItem.changes || []) {
        await this.processChange(object, change, entryItem.id);
      }
      // WhatsApp Business messages
      for (const messaging of entryItem.messaging || []) {
        await this.processMessengerEvent(messaging, entryItem.id);
      }
    }
  }

  private async processChange(object: string, change: any, pageId: string) {
    if (object === 'instagram' && change.field === 'messages') {
      await this.handleInstagramMessage(change.value, pageId);
    } else if (object === 'page' && change.field === 'feed') {
      await this.handleFacebookComment(change.value, pageId);
    } else if (object === 'whatsapp_business_account') {
      await this.handleWhatsAppMessage(change.value, pageId);
    }
  }

  private async processMessengerEvent(messaging: any, pageId: string) {
    if (messaging.message && !messaging.message.is_echo) {
      const client = await this.findClientByPageId(pageId);
      if (!client) return;

      const response = await this.generateResponse(
        client,
        messaging.message.text || '',
        messaging.sender.id,
        'FACEBOOK_MESSAGE',
      );

      if (response) {
        await this.meta.sendMessengerMessage(
          messaging.sender.id,
          response,
          client.fbPageAccessToken,
        );
      }
    }
  }

  private async handleInstagramMessage(value: any, igId: string) {
    const client = await this.findClientByIgId(igId);
    if (!client) return;

    const messages = value.messages || [];
    for (const message of messages) {
      if (message.is_echo) continue;
      const response = await this.generateResponse(client, message.text, message.from.id, 'INSTAGRAM_DM');
      if (response) {
        await this.meta.sendInstagramMessage(message.from.id, response, client.fbPageAccessToken);
      }
    }
  }

  private async handleWhatsAppMessage(value: any, wabaId: string) {
    const client = await this.findClientByWabaId(wabaId);
    if (!client) return;

    const messages = value.messages || [];
    for (const message of messages) {
      if (message.type !== 'text') continue;
      const response = await this.generateResponse(
        client, message.text.body, message.from, 'WHATSAPP',
      );
      if (response && client.whatsappNumber && client.fbPageAccessToken) {
        await this.meta.sendWhatsAppMessage(
          message.from,
          response,
          client.whatsappNumber,
          client.fbPageAccessToken,
        );
      }
    }
  }

  private async handleFacebookComment(value: any, pageId: string) {
    if (value.item !== 'comment' || value.verb !== 'add') return;
    const client = await this.findClientByPageId(pageId);
    if (!client) return;
    // Auto-reply to comments
    const response = await this.generateResponse(client, value.message, value.from.id, 'FACEBOOK_COMMENT');
    if (response) {
      await this.meta.replyToComment(value.comment_id, response, client.fbPageAccessToken);
    }
  }

  // ── Core AI response generation ───────────────────────────

  private async generateResponse(
    client: any,
    messageText: string,
    senderId: string,
    platform: 'INSTAGRAM_DM' | 'WHATSAPP' | 'FACEBOOK_MESSAGE' | 'FACEBOOK_COMMENT',
  ): Promise<string | null> {
    // Get conversation history (last 5 turns)
    // senderPhone is used for WHATSAPP/FACEBOOK; senderIgId for INSTAGRAM
    const history = await this.prisma.conversationLog.findMany({
      where: {
        clientId: client.id,
        OR: [{ senderPhone: senderId }, { senderIgId: senderId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const kbContext = JSON.stringify(client.faqData || {});
    const systemPrompt = `You are a helpful AI receptionist for ${client.businessName}.
Tone: friendly and professional.
Business Type: ${client.businessType || 'Nigerian business'}.

Knowledge Base:
${kbContext}

RULES:
1. Only answer based on the knowledge base. 
2. For bookings, ask for name, phone, preferred date.
3. For complaints, acknowledge then escalate if needed.
4. Respond in the same language the customer wrote in.
5. Keep responses under 200 words.
6. If you cannot help, politely say so and offer to connect them with the team.
${client.greetingMessage ? `Greeting: ${client.greetingMessage}` : ''}`;

    let fullSystemPrompt = systemPrompt + '\n\nConversation History:\n';

    // Add history — ConversationLog stores messages as a JSON array
    // Each entry: { id, type, body, direction: 'inbound' | 'outbound', timestamp }
    for (const h of history.reverse()) {
      const msgArr = Array.isArray(h.messages) ? (h.messages as any[]) : [];
      for (const m of msgArr) {
        if (m.direction === 'inbound') fullSystemPrompt += `User: ${m.body ?? ''}\n`;
        else if (m.direction === 'outbound') fullSystemPrompt += `Assistant: ${m.body ?? ''}\n`;
      }
    }

    // Detect escalation triggers
    const shouldEscalate = (client.escalationTriggers || []).some(
      (trigger: string) => messageText.toLowerCase().includes(trigger.toLowerCase()),
    );

    const sentiment = await this.ai.analyzeSentiment(messageText);
    const intent = this.classifyIntent(messageText);

    let responseText: string | null = null;

    if (!shouldEscalate && sentiment !== 'negative') {
      const { content } = await this.ai.chat(fullSystemPrompt, messageText, { maxTokens: 300, temperature: 0.5 });
      responseText = content;
    }

    // Log conversation — append to existing log or create a new one
    const senderPhoneField = platform !== 'INSTAGRAM_DM' ? senderId : undefined;
    const senderIgIdField = platform === 'INSTAGRAM_DM' ? senderId : undefined;
    const existingLog = await this.prisma.conversationLog.findFirst({
      where: {
        clientId: client.id,
        status: 'ACTIVE',
        OR: [{ senderPhone: senderId }, { senderIgId: senderId }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const inboundEntry = { type: 'text', body: messageText, direction: 'inbound', timestamp: new Date().toISOString() };
    const outboundEntry = responseText
      ? { type: 'text', body: responseText, direction: 'outbound', timestamp: new Date().toISOString() }
      : null;
    const newEntries = outboundEntry ? [inboundEntry, outboundEntry] : [inboundEntry];

    let conversationLogId = existingLog?.id;
    if (existingLog) {
      const prev = Array.isArray(existingLog.messages) ? (existingLog.messages as any[]) : [];
      await this.prisma.conversationLog.update({
        where: { id: existingLog.id },
        data: {
          messages: [...prev, ...newEntries],
          isEscalated: shouldEscalate || existingLog.isEscalated,
          sentiment,
          updatedAt: new Date(),
        },
      });
    } else {
      const externalId = `${senderId}-${Date.now()}`;
      const newLog = await this.prisma.conversationLog.create({
        data: {
          clientId: client.id,
          platform,
          externalId,
          ...(senderPhoneField ? { senderPhone: senderPhoneField } : {}),
          ...(senderIgIdField ? { senderIgId: senderIgIdField } : {}),
          messages: newEntries,
          isEscalated: shouldEscalate,
          sentiment,
        },
      });
      conversationLogId = newLog.id;
    }

    // Capture/update lead
    if (conversationLogId) {
      await this.prisma.leadCapture.upsert({
        where: { conversationId: conversationLogId },
        update: {},
        create: {
          clientId: client.id,
          conversationId: conversationLogId,
          platform,
          phone: senderPhoneField || null,
          intent,
        },
      }).catch(() => { }); // Ignore if unique constraint not defined
    }

    if (shouldEscalate) {
      this.eventEmitter.emit('receptionist.escalation', {
        clientId: client.id,
        senderId,
        message: messageText,
        platform,
      });
      return `Thank you for reaching out! A member of our team will be with you shortly. 🙏`;
    }

    return responseText;
  }

  private classifyIntent(text: string): string {
    const lower = text.toLowerCase();
    if (/price|cost|how much|fee|charge/.test(lower)) return 'pricing';
    if (/book|schedule|appointment|time|available/.test(lower)) return 'booking';
    if (/complaint|bad|terrible|disappointed|wrong/.test(lower)) return 'complaint';
    if (/refund|return|cancel/.test(lower)) return 'refund';
    if (/thank|love|great|awesome/.test(lower)) return 'compliment';
    return 'inquiry';
  }

   // ── Video generation ───────────────────────────────────────────────────────

  async generateVideo(userId: string, dto: GenerateVideoOptions) {
    await this.enforceVideoLimit(userId);
    await this.enforceModelAccess(userId, dto.model);

    const content = await this.prisma.generatedContent.create({
      data: {
        userId,
        type: 'video',
        status: 'generating',
        prompt: dto.prompt,
        model: dto.model,
        aspectRatio: dto.aspectRatio,
        metadata: {
          duration: dto.duration,
          imageUrl: dto.imageUrl,
          negativePrompt: dto.negativePrompt,
          seed: dto.seed,
        },
      },
    });

    await this.incrementVideoUsage(userId);

    try {
      const result = await this.fal.generateVideo(dto);

      return this.prisma.generatedContent.update({
        where: { id: content.id },
        data: { status: 'ready', fileUrl: result.fileUrl, falRequestId: result.falRequestId },
      });
    } catch (err) {
      await this.decrementVideoUsage(userId);
      await this.prisma.generatedContent.update({
        where: { id: content.id },
        data: { status: 'failed', metadata: { error: String(err) } },
      });
      throw err;
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private async findClientByPageId(pageId: string) {
    return this.prisma.receptionistClient.findFirst({
      where: { fbPageId: pageId, isActive: true },
    });
  }

  private async findClientByIgId(igId: string) {
    return this.prisma.receptionistClient.findFirst({
      where: { igPageId: igId, isActive: true },
    });
  }

  private async findClientByWabaId(wabaId: string) {
    return this.prisma.receptionistClient.findFirst({
      where: { whatsappNumber: wabaId, isActive: true },
    });
  }

  // ── Client management ─────────────────────────────────────

  async createReceptionist(userId: string, dto: any) {
    return this.prisma.receptionistClient.create({
      data: { userId, ...dto },
    });
  }

  async getMyReceptionist(userId: string) {
    return this.prisma.receptionistClient.findFirst({
      where: { userId },
    });
  }

  async updateReceptionist(userId: string, dto: any) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');
    return this.prisma.receptionistClient.update({
      where: { id: client.id },
      data: dto,
    });
  }

  async toggleReceptionist(userId: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');
    return this.prisma.receptionistClient.update({
      where: { id: client.id },
      data: { isActive: !client.isActive },
    });
  }

  // ── Conversations ───────────────────────────────────────────

  async getConversations(userId: string, params: { page: number; limit: number; search?: string }) {
    const client = await this.getMyReceptionist(userId);
    if (!client) return { data: [], total: 0 };

    const { page, limit, search } = params;
    const skip = (page - 1) * limit;

    const where = {
      clientId: client.id,
      ...(search ? { messageIn: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.conversationLog.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.conversationLog.count({ where: where as any }),
    ]);

    return { data, total, page, limit };
  }

  async getConversationThread(userId: string, phone: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) return [];
    return this.prisma.conversationLog.findMany({
      where: {
        clientId: client.id,
        OR: [{ senderPhone: phone }, { senderIgId: phone }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendManualReply(userId: string, phone: string, message: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');

    const lastMsg = await this.prisma.conversationLog.findFirst({
      where: {
        clientId: client.id,
        OR: [{ senderPhone: phone }, { senderIgId: phone }],
      },
      orderBy: { createdAt: 'desc' },
    });

    const platform = lastMsg?.platform || 'WHATSAPP';

    if (platform === 'WHATSAPP' && client.whatsappNumber) {
      await this.meta.sendWhatsAppMessage(phone, message, client.whatsappNumber, client.fbPageAccessToken);
    } else if (platform === 'INSTAGRAM_DM') {
      await this.meta.sendInstagramMessage(phone, message, client.fbPageAccessToken);
    } else if (platform === 'FACEBOOK_MESSAGE') {
      await this.meta.sendMessengerMessage(phone, message, client.fbPageAccessToken);
    }

    // Append manual reply to existing conversation log
    const existingLog = await this.prisma.conversationLog.findFirst({
      where: {
        clientId: client.id,
        OR: [{ senderPhone: phone }, { senderIgId: phone }],
      },
      orderBy: { createdAt: 'desc' },
    });
    const outboundEntry = { type: 'text', body: message, direction: 'outbound', timestamp: new Date().toISOString() };
    if (existingLog) {
      const prev = Array.isArray(existingLog.messages) ? (existingLog.messages as any[]) : [];
      return this.prisma.conversationLog.update({
        where: { id: existingLog.id },
        data: { messages: [...prev, outboundEntry], updatedAt: new Date() },
      });
    }
    return this.prisma.conversationLog.create({
      data: {
        clientId: client.id,
        platform,
        externalId: `manual-${phone}-${Date.now()}`,
        senderPhone: phone,
        messages: [outboundEntry],
        isEscalated: false,
      },
    });
  }

  async resolveConversation(userId: string, phone: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');

    try {
      await this.prisma.conversationLog.updateMany({
        where: {
          clientId: client.id,
          status: 'ACTIVE',
          OR: [{ senderPhone: phone }, { senderIgId: phone }],
        },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      const logs = await this.prisma.conversationLog.findMany({
        where: {
          clientId: client.id,
          OR: [{ senderPhone: phone }, { senderIgId: phone }],
        },
        select: { id: true }
      });

      if (logs.length > 0) {
        await this.prisma.leadCapture.updateMany({
          where: { clientId: client.id, conversationId: { in: logs.map(l => l.id) } },
          data: { isQualified: true, qualifiedAt: new Date() },
        });
      }
    } catch (e) {
      // Ignored if missing enum value
    }

    return { success: true, message: 'Conversation resolved' };
  }

  // ── Knowledge Base ──────────────────────────────────────────

  async addKnowledgeEntry(userId: string, dto: { question: string; answer: string }) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');

    const kb = (client.faqData as any[]) || [];
    const newEntry = { id: crypto.randomUUID(), ...dto };
    kb.push(newEntry);

    return this.prisma.receptionistClient.update({
      where: { id: client.id },
      data: { faqData: kb as any },
    });
  }

  async getKnowledge(userId: string) {
    const client = await this.getMyReceptionist(userId);
    return client?.faqData || [];
  }

  async deleteKnowledgeEntry(userId: string, entryId: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');

    const kb = (client.faqData as any[]) || [];
    const updatedKb = kb.filter((entry: any) => entry.id !== entryId);

    return this.prisma.receptionistClient.update({
      where: { id: client.id },
      data: { faqData: updatedKb as any },
    });
  }
  // ── Content history ────────────────────────────────────────────────────────

  async listContent(userId: string, query: {
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { type, status, page = 1, limit = 20 } = query;
    const where: any = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.generatedContent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.generatedContent.count({ where }),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  // ── Image generation ───────────────────────────────────────────────────────

  async generateImage(userId: string, dto: {
    action: 'generate' | 'edit' | 'upscale' | 'remove-bg';
    prompt?: string;
    model?: string;
    aspectRatio?: string;
    numImages?: number;
    seed?: number;
    negativePrompt?: string;
    guidanceScale?: number;
    style?: string;
    imageUrl?: string;
    mask?: string;
    strength?: number;
  }) {
    if (dto.action === 'generate') {
      await this.enforceImageLimit(userId);
    }

    const content = await this.prisma.generatedContent.create({
      data: {
        userId,
        type: dto.action === 'generate' ? 'image' : 'image_edit',
        status: 'generating',
        prompt: dto.prompt ?? 'Image transform',
        model: dto.model ?? 'flux-pro-ultra',
        aspectRatio: dto.aspectRatio ?? '1:1',
      },
    });

    try {
      let result: any;

      switch (dto.action) {
        case 'generate': {
          if (!dto.prompt || !dto.model || !dto.aspectRatio) {
            throw new BadRequestException('prompt, model, and aspectRatio are required for generate');
          }
          result = await this.fal.generateImage(dto as GenerateImageOptions);
          await this.incrementImageUsage(userId);
          break;
        }
        case 'edit': {
          if (!dto.imageUrl || !dto.prompt) {
            throw new BadRequestException('imageUrl and prompt are required for edit');
          }
          result = await this.fal.editImage({
            imageUrl: dto.imageUrl,
            prompt: dto.prompt,
            model: dto.model,
            mask: dto.mask,
            strength: dto.strength,
          });
          break;
        }
        case 'upscale': {
          if (!dto.imageUrl) throw new BadRequestException('imageUrl is required for upscale');
          result = await this.fal.upscaleImage(dto.imageUrl);
          break;
        }
        case 'remove-bg': {
          if (!dto.imageUrl) throw new BadRequestException('imageUrl is required for remove-bg');
          result = await this.fal.removeBackground(dto.imageUrl);
          break;
        }
      }

      const fileUrl = result.imageUrl ?? result.images?.[0]?.url;
      const width = result.images?.[0]?.width;
      const height = result.images?.[0]?.height;

      return this.prisma.generatedContent.update({
        where: { id: content.id },
        data: {
          status: 'ready',
          fileUrl,
          width,
          height,
          falRequestId: result.falRequestId,
          metadata: { allImages: result.images, seed: dto.seed },
        },
      });
    } catch (err) {
      await this.prisma.generatedContent.update({
        where: { id: content.id },
        data: { status: 'failed', metadata: { error: String(err) } },
      });
      throw err;
    }
  }

  async deleteContent(userId: string, id: string) {
    const item = await this.prisma.generatedContent.findFirst({ where: { id, userId } });
    if (!item) throw new NotFoundException('Content not found.');
    await this.prisma.generatedContent.delete({ where: { id } });
    return { success: true };
  }

  // ── Analytics & Admin ───────────────────────────────────────

  async getAnalytics(userId: string) {
    const client = await this.getMyReceptionist(userId);
    if (!client) throw new BadRequestException('Receptionist config not found');
    return this.getClientAnalytics(client.id);
  }

  private async getClientAnalytics(clientId: string) {
    const [totalConversations, leads, sentiment] = await Promise.all([
      this.prisma.conversationLog.count({ where: { clientId } }),
      this.prisma.leadCapture.groupBy({
        by: ['isQualified'],
        where: { clientId },
        _count: true,
      }),
      this.prisma.conversationLog.groupBy({
        by: ['sentiment'],
        where: { clientId },
        _count: true,
      }),
    ]);
    return { totalConversations, leads, sentiment };
  }

  async adminListAll(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.receptionistClient.findMany({ skip, take: limit }),
      this.prisma.receptionistClient.count(),
    ]);
    return { data, total, page, limit };
  }

  async adminSuspend(id: string) {
    return this.prisma.receptionistClient.update({
      where: { id },
      data: { isActive: false },
    });
  }

  
  // ── Limit helpers ──────────────────────────────────────────────────────────

  private async getUserTier(userId: string): Promise<SubscriptionTier> {
    const sub = await this.prisma.subscription.findFirst({
      where: { userId, productSlug: 'viralkit', status: { in: ['ACTIVE', 'TRIAL'] as any } },
      orderBy: { currentPeriodEnd: 'desc' },
    });
    return (sub?.tier ?? SubscriptionTier.FREE) as SubscriptionTier;
  }

  private async getCurrentUsage(userId: string) {
    return this.prisma.usageRecord.findFirst({
      where: { userId, productSlug: 'viralkit', periodEnd: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async enforceImageLimit(userId: string) {
    const tier = await this.getUserTier(userId);
    const limit = TIER_LIMITS[tier].images;
    if (limit === null) return;

    const usage = await this.getCurrentUsage(userId);
    const used = usage?.imagesUsed ?? 0;
    if (used >= limit) {
      throw new BadRequestException(
        `You've used all ${limit} images for this period. Upgrade to generate more.`,
      );
    }
  }

  private async enforceVideoLimit(userId: string) {
    const tier = await this.getUserTier(userId);
    const limit = TIER_LIMITS[tier].videos;
    if (limit === null) return;

    const usage = await this.getCurrentUsage(userId);
    const used = usage?.videosUsed ?? 0;
    if (used >= limit) {
      throw new BadRequestException(
        `You've used all ${limit} videos for this period. Upgrade to generate more.`,
      );
    }
  }

  private async enforceModelAccess(userId: string, model: string) {
    const tier = await this.getUserTier(userId);
    if (PRO_ONLY_MODELS.includes(model) && !['PRO', 'AGENCY', 'ENTERPRISE'].includes(tier)) {
      throw new BadRequestException(`${model} requires a Pro plan or higher.`);
    }
    if (STARTER_PLUS_MODELS.includes(model) && tier === 'FREE') {
      throw new BadRequestException(`${model} requires a Starter plan or higher.`);
    }
  }

  private async incrementImageUsage(userId: string) {
    const usage = await this.getCurrentUsage(userId);
    if (usage) {
      await this.prisma.usageRecord.update({
        where: { id: usage.id },
        data: { imagesUsed: { increment: 1 } },
      });
    }
  }

  private async incrementVideoUsage(userId: string) {
    const usage = await this.getCurrentUsage(userId);
    if (usage) {
      await this.prisma.usageRecord.update({
        where: { id: usage.id },
        data: { videosUsed: { increment: 1 } },
      });
    }
  }

  private async decrementVideoUsage(userId: string) {
    const usage = await this.getCurrentUsage(userId);
    if (usage && usage.videosUsed > 0) {
      await this.prisma.usageRecord.update({
        where: { id: usage.id },
        data: { videosUsed: { decrement: 1 } },
      });
    }
  }
}