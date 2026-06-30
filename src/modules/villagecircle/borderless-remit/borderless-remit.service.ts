import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Transfer } from './transfer.schema';

// Indicative FX rates — in production swap with a live rates API (e.g. ExchangeRate-API, Fixer.io)
const FX_RATES: Record<string, Record<string, number>> = {
  NGN: { USD: 0.00063, GBP: 0.00050, EUR: 0.00058, GHS: 0.0091, KES: 0.082, CAD: 0.00086 },
  USD: { NGN: 1580, GBP: 0.79, EUR: 0.92, GHS: 14.4, KES: 130, CAD: 1.36 },
  GBP: { NGN: 2000, USD: 1.27, EUR: 1.17, GHS: 18.2, KES: 165 },
  EUR: { NGN: 1720, USD: 1.09, GBP: 0.86, GHS: 15.6, KES: 141 },
};

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'CAD'];
const SUPPORTED_BANKS_NG = [
  'Access Bank', 'GTBank', 'Zenith Bank', 'First Bank', 'UBA',
  'Fidelity Bank', 'Sterling Bank', 'Wema Bank', 'Polaris Bank', 'Kuda Bank',
];

const TRANSFER_FEE_NGN = 500; // flat ₦500 per transfer — update with real fee logic later

@Injectable()
export class BorderlessRemitService {
  private readonly logger = new Logger(BorderlessRemitService.name);

  // ── Quote ──────────────────────────────────────────────────────────────────

  getQuote(sendCurrency: string, receiveCurrency: string, sendAmount: number) {
    const from = sendCurrency.toUpperCase();
    const to = receiveCurrency.toUpperCase();

    if (!SUPPORTED_CURRENCIES.includes(from)) {
      throw new BadRequestException(`${from} is not a supported currency.`);
    }
    if (!SUPPORTED_CURRENCIES.includes(to)) {
      throw new BadRequestException(`${to} is not a supported currency.`);
    }
    if (from === to) throw new BadRequestException('Send and receive currencies must differ.');

    const rate = FX_RATES[from]?.[to];
    if (!rate) throw new BadRequestException(`Rate for ${from} → ${to} is not available.`);

    const receiveAmount = parseFloat((sendAmount * rate).toFixed(2));
    const feeInSendCurrency = from === 'NGN'
      ? TRANSFER_FEE_NGN
      : parseFloat((TRANSFER_FEE_NGN * (FX_RATES['NGN']?.[from] ?? 0)).toFixed(2));

    return {
      sendAmount,
      sendCurrency: from,
      receiveAmount,
      receiveCurrency: to,
      rate,
      fee: feeInSendCurrency,
      feeCurrency: from,
      estimatedDelivery: '1–3 business days',
      provider: 'BoldMind Remit (Beta)',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // quote valid 10 min
    };
  }

  getSupportedCurrencies() {
    return { currencies: SUPPORTED_CURRENCIES, banks: SUPPORTED_BANKS_NG };
  }

  // ── Initiate transfer ──────────────────────────────────────────────────────

  async initiateTransfer(userId: string, dto: {
    sendAmount: number;
    sendCurrency: string;
    receiveCurrency: string;
    sender: { name: string; country: string };
    recipient: { name: string; phone: string; bank: string; accountNumber: string; accountName: string };
  }) {
    const quote = this.getQuote(dto.sendCurrency, dto.receiveCurrency, dto.sendAmount);
    const trackingId = `BR-${uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase()}`;

    const transfer = await Transfer.create({
      userId,
      trackingId,
      amount: {
        send: dto.sendAmount,
        sendCurrency: quote.sendCurrency,
        receive: quote.receiveAmount,
        receiveCurrency: quote.receiveCurrency,
      },
      rates: {
        official: quote.rate,
        blackMarket: quote.rate, // placeholder — integrate live black market data separately
        selected: quote.rate,
        provider: quote.provider,
      },
      sender: dto.sender,
      recipient: dto.recipient,
      fees: {
        providerFee: 0,
        transferFee: quote.fee,
        totalFee: quote.fee,
      },
      estimatedDelivery: quote.estimatedDelivery,
      status: 'pending',
      timeline: [{
        status: 'pending',
        timestamp: new Date(),
        message: 'Transfer initiated. Awaiting payment confirmation.',
      }],
    });

    this.logger.log(`Transfer ${trackingId} initiated by user ${userId}`);
    return { trackingId, transferId: transfer._id, quote };
  }

  // ── My transfers ───────────────────────────────────────────────────────────

  async getMyTransfers(userId: string, query: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = query;
    const filter: any = { userId };
    if (status) filter.status = status;

    const [items, total] = await Promise.all([
      Transfer.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Transfer.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit, hasMore: page * limit < total };
  }

  async getTransferByTracking(userId: string, trackingId: string) {
    const transfer = await Transfer.findOne({ trackingId, userId }).lean();
    if (!transfer) throw new NotFoundException('Transfer not found.');
    return transfer;
  }

  async cancelTransfer(userId: string, trackingId: string) {
    const transfer = await Transfer.findOne({ trackingId, userId });
    if (!transfer) throw new NotFoundException('Transfer not found.');
    if (!['pending'].includes(transfer.status)) {
      throw new BadRequestException(`Cannot cancel a transfer with status "${transfer.status}".`);
    }

    transfer.status = 'cancelled';
    transfer.timeline.push({ status: 'cancelled', timestamp: new Date(), message: 'Cancelled by sender.' });
    await transfer.save();

    return { success: true, trackingId };
  }

  // ── Admin / webhook: update status ────────────────────────────────────────

  async updateTransferStatus(
    trackingId: string,
    status: 'processing' | 'completed' | 'failed',
    message?: string,
  ) {
    const transfer = await Transfer.findOne({ trackingId });
    if (!transfer) throw new NotFoundException('Transfer not found.');

    transfer.status = status;
    transfer.timeline.push({
      status,
      timestamp: new Date(),
      message: message ?? `Status updated to ${status}.`,
    });
    if (status === 'completed') transfer.actualDelivery = new Date();

    await transfer.save();
    this.logger.log(`Transfer ${trackingId} → ${status}`);
    return { success: true };
  }
}
