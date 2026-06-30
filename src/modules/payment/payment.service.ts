import {
  Injectable, BadRequestException, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { InitializePaymentDto, CreateSubscriptionDto } from './payment.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly PAYSTACK_SECRET: string;
  private readonly PAYSTACK_BASE = 'https://api.paystack.co';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.PAYSTACK_SECRET = this.config.get<string>('PAYSTACK_SECRET_KEY');
  }

  private get paystackHeaders() {
    return {
      Authorization: `Bearer ${this.PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    };
  }

  private async paystackPost(path: string, body: any) {
    const { data } = await axios.post(`${this.PAYSTACK_BASE}${path}`, body, {
      headers: this.paystackHeaders,
    });
    return data.data;
  }

  private async paystackGet(path: string) {
    const { data } = await axios.get(`${this.PAYSTACK_BASE}${path}`, {
      headers: this.paystackHeaders,
    });
    return data.data;
  }

  // ── Initialize payment ─────────────────────────────────────

  async initializePayment(userId: string, userEmail: string, dto: InitializePaymentDto) {
    const reference = `BM_${Date.now()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`;

    const paystackData = await this.paystackPost('/transaction/initialize', {
      email: userEmail,
      amount: dto.amountNGN,
      reference,
      currency: 'NGN',
      callback_url: dto.callbackUrl || this.config.get('PAYMENT_CALLBACK_URL'),
      metadata: {
        userId,
        productSlug: dto.productSlug,
        ...dto.metadata,
      },
    });

    // Create pending payment record
    await this.prisma.payment.create({
      data: {
        userId,
        paystackRef: reference,
        amountNGN: dto.amountNGN,
        status: 'PENDING',
        productSlug: dto.productSlug,
        description: dto.description,
        metadata: dto.metadata || {},
      },
    });

    return {
      authorizationUrl: paystackData.authorization_url,
      reference,
      accessCode: paystackData.access_code,
    };
  }

  // ── Verify payment ────────────────────────────────────────

  async verifyPayment(reference: string) {
    const paystackTrx = await this.paystackGet(`/transaction/verify/${reference}`);

    const payment = await this.prisma.payment.findUnique({ where: { paystackRef: reference } });
    if (!payment) throw new NotFoundException('Payment record not found');

    const status = paystackTrx.status === 'success' ? 'SUCCESS' : 'FAILED';
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status,
        channel: paystackTrx.channel,
        paystackTrxRef: paystackTrx.reference,
        paidAt: status === 'SUCCESS' ? new Date(paystackTrx.paid_at) : null,
      },
    });

    if (status === 'SUCCESS') {
      this.eventEmitter.emit('payment.success', {
        userId: payment.userId,
        paymentId: payment.id,
        productSlug: payment.productSlug,
        amountNGN: payment.amountNGN,
      });
    }

    return updated;
  }

  // ── Webhook handler ───────────────────────────────────────

  async handleWebhook(signature: string, rawBody: Buffer) {
    // Verify Paystack signature
    const hash = crypto
      .createHmac('sha512', this.PAYSTACK_SECRET)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody.toString());
    this.logger.log(`Paystack webhook: ${event.event}`);

    switch (event.event) {
      case 'charge.success':
        await this.handleChargeSuccess(event.data);
        break;
      case 'subscription.create':
        await this.handleSubscriptionCreated(event.data);
        break;
      case 'subscription.disable':
        await this.handleSubscriptionDisabled(event.data);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoiceFailure(event.data);
        break;
    }
  }

  private async handleChargeSuccess(data: any) {
    const reference = data.reference;
    const payment = await this.prisma.payment.findUnique({ where: { paystackRef: reference } });
    if (!payment || payment.status === 'SUCCESS') return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', paidAt: new Date(), channel: data.channel },
    });

    this.eventEmitter.emit('payment.success', {
      userId: payment.userId,
      paymentId: payment.id,
      productSlug: payment.productSlug,
      amountNGN: payment.amountNGN,
    });
  }

  private async handleSubscriptionCreated(data: any) {
    const userId = data.metadata?.userId;
    if (!userId) return;

    await this.prisma.subscription.updateMany({
      where: { userId, paystackSubCode: data.subscription_code },
      data: { status: 'ACTIVE' },
    });
  }

  private async handleSubscriptionDisabled(data: any) {
    await this.prisma.subscription.updateMany({
      where: { paystackSubCode: data.subscription_code },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }

  private async handleInvoiceFailure(data: any) {
    await this.prisma.subscription.updateMany({
      where: { paystackSubCode: data.subscription?.subscription_code },
      data: { status: 'PAST_DUE' },
    });

    this.eventEmitter.emit('payment.invoice_failed', {
      subscriptionCode: data.subscription?.subscription_code,
    });
  }

  // ── User payment history ───────────────────────────────────

  async getUserPayments(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { invoice: true },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);
    return { data: payments, meta: { total, page, limit } };
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async checkProductAccess(userId: string, productSlug: string): Promise<boolean> {
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

  async createWaitlistEntry(productSlug: string, email: string, name?: string, userId?: string) {
    const count = await this.prisma.waitlistEntry.count({ where: { productSlug } });
    return this.prisma.waitlistEntry.upsert({
      where: { email_productSlug: { email, productSlug } },
      update: {},
      create: { email, productSlug, name, userId, position: count + 1 },
    });
  }
}