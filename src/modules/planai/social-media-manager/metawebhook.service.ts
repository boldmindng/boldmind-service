import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { MessagePlatform } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { QUEUES } from '../../../common/constants/queues';

// ─── Payload types ───────────────────────────────────────────────────────────

export interface MetaWebhookPayload {
  object: 'whatsapp_business_account' | 'instagram' | 'page';
  entry: MetaEntry[];
}

interface MetaEntry {
  id: string;
  changes: MetaChange[];
  messaging?: MetaMessengerEvent[]; // Facebook / Instagram Messenger
}

interface MetaChange {
  value: MetaChangeValue;
  field: string;
}

interface MetaChangeValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{ profile: { name: string }; wa_id: string }>;
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
  // Instagram comment webhooks
  comments?: MetaComment[];
}

export interface MetaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'interactive' | 'button' | 'sticker' | 'location';
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256?: string };
  audio?: { id: string; mime_type: string };
  document?: { id: string; mime_type: string; filename?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
  location?: { latitude: number; longitude: number; name?: string };
}

interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

interface MetaComment {
  id: string;
  from: { id: string; name?: string };
  message: string;
  media_id?: string;
  timestamp: string;
}

interface MetaMessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text: string };
}

// ─── Inbound job payload pushed to the receptionist queue ────────────────────
export interface InboundMessageJob {
  phoneNumberId: string;
  from: string;
  senderName: string;
  message: MetaMessage;
  platform: MessagePlatform;
}

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name);

  // Meta API version — bump here only; used everywhere below
  private readonly apiVersion = 'v19.0';

  // Credentials loaded once at construction
  private readonly verifyToken: string;
  private readonly appSecret: string;
  private readonly defaultWaToken: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(QUEUES.WEBHOOK_DELIVERY) private readonly receptionistQueue: Queue,
  ) {
    this.verifyToken    = this.config.getOrThrow<string>('META_WEBHOOK_VERIFY_TOKEN');
    this.appSecret      = this.config.getOrThrow<string>('META_APP_SECRET');
    this.defaultWaToken = this.config.getOrThrow<string>('META_WHATSAPP_TOKEN');
  }

  // ── Webhook verification (GET) ──────────────────────────────────────────────

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('✅ Meta webhook verified');
      return challenge;
    }
    throw new UnauthorizedException('Meta webhook verification failed — token mismatch');
  }

  // ── Signature validation ────────────────────────────────────────────────────

  validateSignature(rawBody: Buffer, signature: string): boolean {
    const expected = `sha256=${crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex')}`;

    // Both buffers must be the same length before timingSafeEqual
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // ── Process incoming webhook (POST) ────────────────────────────────────────

  async processWebhook(
    payload: MetaWebhookPayload,
    rawBody: Buffer,
    signature: string,
  ): Promise<{ status: 'ok' }> {
    if (!this.validateSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid Meta webhook signature');
    }

    for (const entry of payload.entry) {
      // WhatsApp Business — field=messages
      for (const change of entry.changes ?? []) {
        if (change.field === 'messages') {
          await this.handleWhatsAppMessages(change.value);
        }
      }

      // Facebook / Instagram Messenger — entry.messaging array
      if (entry.messaging?.length) {
        for (const event of entry.messaging) {
          if (event.message) {
            await this.handleMessengerEvent(entry.id, event, payload.object);
          }
        }
      }
    }

    return { status: 'ok' };
  }

  // ── WhatsApp inbound ────────────────────────────────────────────────────────

  private async handleWhatsAppMessages(value: MetaChangeValue): Promise<void> {
    if (!value.messages?.length) {
      // May be a status-only update
      if (value.statuses?.length) await this.handleStatuses(value.statuses);
      return;
    }

    for (const msg of value.messages) {
      const contact   = value.contacts?.find(c => c.wa_id === msg.from);
      const senderName = contact?.profile?.name ?? 'Unknown';

      // Deduplicate — Meta occasionally sends the same message twice
      const dedupKey = `meta:msg:${msg.id}`;
      const seen = await this.redis.get(dedupKey);
      if (seen) {
        this.logger.debug(`Duplicate WA message skipped: ${msg.id}`);
        continue;
      }
      await this.redis.set(dedupKey, '1', 3600);

      this.logger.log(`📱 WA inbound from=${msg.from} (${senderName}) type=${msg.type}`);

      // Push to receptionist queue — return 200 immediately, process async
      await this.receptionistQueue.add(
        'process-inbound',
        {
          phoneNumberId: value.metadata.phone_number_id,
          from:          msg.from,
          senderName,
          message:       msg,
          platform:      'WHATSAPP' as MessagePlatform,
        } satisfies InboundMessageJob,
        { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
      );

      await this.upsertConversation(
        msg.from,
        senderName,
        msg,
        'WHATSAPP',
        value.metadata.phone_number_id,
      );
    }

    if (value.statuses?.length) {
      await this.handleStatuses(value.statuses);
    }
  }

  // ── Facebook / Instagram Messenger inbound ──────────────────────────────────

  private async handleMessengerEvent(
    pageId: string,
    event: MetaMessengerEvent,
    object: MetaWebhookPayload['object'],
  ): Promise<void> {
    if (!event.message?.text) return;

    const platform: MessagePlatform =
      object === 'instagram' ? 'INSTAGRAM_DM' : 'FACEBOOK_MESSAGE';

    const dedupKey = `meta:msg:${event.message.mid}`;
    const seen = await this.redis.get(dedupKey);
    if (seen) return;
    await this.redis.set(dedupKey, '1', 3600);

    this.logger.log(`💬 ${platform} inbound senderId=${event.sender.id}`);

    await this.receptionistQueue.add(
      'process-inbound',
      {
        phoneNumberId: pageId,
        from:          event.sender.id,
        senderName:    event.sender.id,
        message: {
          from:      event.sender.id,
          id:        event.message.mid,
          timestamp: String(event.timestamp),
          type:      'text',
          text:      { body: event.message.text },
        },
        platform,
      } satisfies InboundMessageJob,
      { attempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
    );
  }

  // ── Send methods ────────────────────────────────────────────────────────────

  async sendTextMessage(
    phoneNumberId: string,
    to: string,
    text: string,
    accessToken = this.defaultWaToken,
  ): Promise<unknown> {
    return this.waPost(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      recipient_type:    'individual',
      to,
      type:              'text',
      text:              { preview_url: false, body: text },
    });
  }

  async sendTemplateMessage(
    phoneNumberId: string,
    to: string,
    templateName: string,
    langCode: string,
    components: unknown[],
    accessToken = this.defaultWaToken,
  ): Promise<unknown> {
    return this.waPost(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type:              'template',
      template:          { name: templateName, language: { code: langCode }, components },
    });
  }

  async sendInteractiveButtons(
    phoneNumberId: string,
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    accessToken = this.defaultWaToken,
  ): Promise<unknown> {
    return this.waPost(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type:              'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    });
  }

  async sendInteractiveList(
    phoneNumberId: string,
    to: string,
    headerText: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
    accessToken = this.defaultWaToken,
  ): Promise<unknown> {
    return this.waPost(phoneNumberId, accessToken, {
      messaging_product: 'whatsapp',
      to,
      type:              'interactive',
      interactive: {
        type:   'list',
        header: { type: 'text', text: headerText },
        body:   { text: bodyText },
        action: { button: buttonLabel, sections },
      },
    });
  }

  // Per-client WhatsApp token (Receptionist clients each have their own)
  async sendWhatsAppMessage(
    to: string,
    text: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<unknown> {
    return this.sendTextMessage(phoneNumberId, to, text, accessToken);
  }

  async sendMessengerMessage(
    recipientId: string,
    text: string,
    accessToken: string,
  ): Promise<unknown> {
    return this.graphPost('/me/messages', accessToken, {
      recipient: { id: recipientId },
      message:   { text },
    });
  }

  async sendInstagramMessage(
    recipientId: string,
    text: string,
    accessToken: string,
  ): Promise<unknown> {
    return this.sendMessengerMessage(recipientId, text, accessToken);
  }

  async replyToComment(
    commentId: string,
    message: string,
    accessToken: string,
  ): Promise<unknown> {
    return this.graphPost(`/${commentId}/comments`, accessToken, { message });
  }

  // ── Media ───────────────────────────────────────────────────────────────────

  async downloadMediaUrl(mediaId: string): Promise<string> {
    const { data } = await firstValueFrom(
      this.http.get(
        `https://graph.facebook.com/${this.apiVersion}/${mediaId}`,
        { headers: { Authorization: `Bearer ${this.defaultWaToken}` } },
      ),
    );
    return data.url as string;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * POST to /{phoneNumberId}/messages — shared by all WA send methods.
   * Any 4xx/5xx from Meta surfaces as a thrown error with the Meta response body logged.
   */
  private async waPost(
    phoneNumberId: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${phoneNumberId}/messages`;
    try {
      const { data } = await firstValueFrom(
        this.http.post(url, body, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      );
      return data;
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data;
      this.logger.error(`Meta WA send failed (${phoneNumberId} → ${(body as any).to}):`, detail);
      throw err;
    }
  }

  /** POST to any Graph API endpoint using a page/business access token */
  private async graphPost(
    path: string,
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `https://graph.facebook.com/${this.apiVersion}${path}`;
    try {
      const { data } = await firstValueFrom(
        this.http.post(url, body, { params: { access_token: accessToken } }),
      );
      return data;
    } catch (err: unknown) {
      const detail = (err as any)?.response?.data;
      this.logger.error(`Meta Graph POST ${path} failed:`, detail);
      throw err;
    }
  }

  /**
   * Upsert a ConversationLog row for an inbound message.
   * Finds the ReceptionistClient by whatsappNumber (WA) or fbPageId/igPageId (Messenger).
   * If no client is found the message is logged and skipped — it's not an error,
   * it just means the number isn't registered in the platform yet.
   */
  private async upsertConversation(
    from: string,
    senderName: string,
    msg: MetaMessage,
    platform: MessagePlatform,
    pageOrPhoneId: string,
  ): Promise<void> {
    // Look up the ReceptionistClient owning this number/page
    const client = await this.prisma.receptionistClient.findFirst({
      where: {
        OR: [
          { whatsappNumber: from },
          { whatsappNumber: pageOrPhoneId },
          { fbPageId: pageOrPhoneId },
          { igPageId: pageOrPhoneId },
        ],
      },
    });

    if (!client) {
      this.logger.warn(
        `No ReceptionistClient matched pageOrPhoneId="${pageOrPhoneId}" from="${from}" — conversation not logged.`,
      );
      return;
    }

    const messageEntry = {
      id:        msg.id,
      type:      msg.type,
      body:      msg.text?.body ?? `[${msg.type}]`,
      timestamp: new Date(Number(msg.timestamp) * 1000).toISOString(),
      direction: 'inbound',
    };

    // Try to append to an existing ACTIVE conversation for this sender
    const existing = await this.prisma.conversationLog.findFirst({
      where:   { clientId: client.id, senderPhone: from, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const messages: any = Array.isArray(existing.messages)
        ? (existing.messages as unknown[])
        : [];
      await this.prisma.conversationLog.update({
        where: { id: existing.id },
        data: {
          senderName,
          messages:  [...messages, messageEntry],
          updatedAt: new Date(),
        },
      });
    } else {
      await this.prisma.conversationLog.create({
        data: {
          clientId:    client.id,
          platform,
          externalId:  msg.id,
          senderName,
          senderPhone: platform === 'WHATSAPP' ? from : undefined,
          senderIgId:  platform === 'INSTAGRAM_DM' ? from : undefined,
          messages:    [messageEntry],
          status:      'ACTIVE',
        },
      });
    }
  }

  /**
   * Update delivery status of outbound messages stored inside ConversationLog.messages JSON.
   * Non-critical — catch all errors silently to never block the webhook 200 response.
   */
  private async handleStatuses(statuses: MetaStatus[]): Promise<void> {
    for (const s of statuses) {
      try {
        // Find conversation that contains a message with this Meta message ID.
        // Messages are a JSON array — Prisma JSON path filtering isn't supported
        // in all Neon PG versions, so we query by externalId (set to first msg id).
        const conv = await this.prisma.conversationLog.findFirst({
          where: { externalId: s.id },
        });
        if (!conv) continue;

        const messages: any = Array.isArray(conv.messages)
          ? (conv.messages as Array<Record<string, unknown>>)
          : [];

        const updated = messages.map(m =>
          m['id'] === s.id ? { ...m, deliveryStatus: s.status } : m,
        );

        await this.prisma.conversationLog.update({
          where: { id: conv.id },
          data:  { messages: updated, updatedAt: new Date() },
        });
      } catch {
        // delivery status update is non-critical — never throw
      }
    }
  }
}