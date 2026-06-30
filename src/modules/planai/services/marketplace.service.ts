import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import {
  CreateServiceListingDto, CreateDigitalProductDto, BookServiceDto,
} from '../dto/all-planai.dto';

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);

  private readonly paystackSecretKey: string;
  private readonly gigApiKey: string;
  private readonly gigBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.paystackSecretKey = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
    this.gigApiKey         = this.config.get<string>('GIG_LOGISTICS_API_KEY', '');
    this.gigBaseUrl        = this.config.get<string>('GIG_LOGISTICS_BASE_URL', 'https://api.giglogistics.com');
  }

  // ─── Service listings ─────────────────────────────────────────────────────────

  async createServiceListing(userId: string, dto: CreateServiceListingDto) {
    const listingId = `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // AI-enhance listing description for SEO + discoverability
    const enhanced = await this.ai.generateJson<{
      enhancedDescription: string;
      searchTags: string[];
      highlightBullets: string[];
      seoTitle: string;
    }>(
      'You are a Nigerian marketplace listing specialist. Valid JSON only.',
      `Enhance this service listing for a Nigerian freelance marketplace.
Title: "${dto.title}", Category: ${dto.category}
Description: "${dto.description}"
Price: ₦${dto.basePriceNGN}, Location: ${dto.state ?? 'Nigeria'} ${dto.lga ?? ''}

Return JSON: { enhancedDescription (compelling 100-word rewrite), searchTags: [8 relevant tags],
highlightBullets: [3 key selling points], seoTitle (60-char max) }`,
      { task: 'creative', temperature: 0.7 },
    ).catch(() => null);

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'marketplace.listing_created',
        productSlug: 'boldmind-marketplace',
        metadata: {
          listingId,
          title: dto.title,
          category: dto.category,
          basePriceNGN: dto.basePriceNGN,
          state: dto.state,
          lga: dto.lga,
          availability: dto.availability ?? 'scheduled',
          videoShowcaseUrl: dto.videoShowcaseUrl,
          description: enhanced?.enhancedDescription ?? dto.description,
          searchTags: enhanced?.searchTags ?? [],
          highlightBullets: enhanced?.highlightBullets ?? [],
          seoTitle: enhanced?.seoTitle ?? dto.title,
          status: 'active',
        },
      },
    });

    return {
      listingId,
      title: dto.title,
      category: dto.category,
      basePriceNGN: dto.basePriceNGN,
      state: dto.state,
      availability: dto.availability ?? 'scheduled',
      enhanced: enhanced ?? null,
      listingUrl: `https://marketplace.boldmind.ng/services/${listingId}`,
      status: 'active',
      nextSteps: [
        'Upload a 30-second video showcase to boost bookings by 3x',
        'Complete NIN verification to earn the Verified badge',
        'Set your availability calendar to get instant bookings',
      ],
    };
  }

  async getServiceListings(filters?: {
    category?: string; state?: string; lga?: string;
    minPriceNGN?: number; maxPriceNGN?: number;
    availability?: string; page?: number; limit?: number;
  }) {
    const cacheKey = `marketplace:services:${JSON.stringify(filters ?? {})}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const logs = await this.prisma.activityLog.findMany({
      where: {
        action: 'marketplace.listing_created',
        ...(filters?.category ? { metadata: { path: ['category'], equals: filters.category } } : {}),
        ...(filters?.state    ? { metadata: { path: ['state'],    equals: filters.state    } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 20,
      skip: ((filters?.page ?? 1) - 1) * (filters?.limit ?? 20),
    });

    const listings = logs
      .map((l) => ({ ...(l.metadata as object), createdAt: l.createdAt }))
      .filter((l) => {
        const price = (l as Record<string, unknown>)['basePriceNGN'] as number;
        if (filters?.minPriceNGN && price < filters.minPriceNGN) return false;
        if (filters?.maxPriceNGN && price > filters.maxPriceNGN) return false;
        return true;
      });

    const result = { listings, total: listings.length, page: filters?.page ?? 1 };
    await this.redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  // ─── Digital products ─────────────────────────────────────────────────────────

  async createDigitalProduct(userId: string, dto: CreateDigitalProductDto) {
    const productId = `dprod_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'marketplace.digital_product_created',
        productSlug: 'boldmind-marketplace',
        metadata: {
          productId,
          title: dto.title,
          description: dto.description,
          productType: dto.productType,
          priceNGN: dto.priceNGN,
          fileUrl: dto.fileUrl,
          tags: dto.tags ?? [],
          downloads: 0,
          status: 'active',
        },
      },
    });

    return {
      productId,
      title: dto.title,
      productType: dto.productType,
      priceNGN: dto.priceNGN,
      storeUrl: `https://marketplace.boldmind.ng/digital/${productId}`,
      status: 'active',
    };
  }

  async purchaseDigitalProduct(userId: string, productId: string) {
    const log = await this.prisma.activityLog.findFirst({
      where: { action: 'marketplace.digital_product_created', metadata: { path: ['productId'], equals: productId } },
    });

    if (!log) throw new NotFoundException('Digital product not found');

    const product = log.metadata as Record<string, unknown>;
    const priceNGN = product['priceNGN'] as number;

    if (priceNGN === 0) {
      // Free product — deliver immediately
      await this.prisma.activityLog.create({
        data: {
          userId,
          action: 'marketplace.digital_download',
          productSlug: 'boldmind-marketplace',
          metadata: { productId, downloadedAt: new Date().toISOString() },
        },
      });
      return { access: 'immediate', fileUrl: product['fileUrl'], message: 'Download ready.' };
    }

    // Paid — create Paystack payment link
    const paymentRef = `dprod_${productId}_${Date.now()}`;
    const paystackLink = await this.createPaystackPaymentLink({
      email: `buyer_${userId}@boldmind.ng`, // placeholder — use real user email in production
      amountKobo: priceNGN * 100,
      reference: paymentRef,
      metadata: { productId, userId, type: 'digital_product' },
    });

    return { access: 'payment_required', paymentUrl: paystackLink, reference: paymentRef };
  }

  // ─── Service booking ──────────────────────────────────────────────────────────

  async bookService(userId: string, dto: BookServiceDto) {
    const bookingId = `booking_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const listing = await this.prisma.activityLog.findFirst({
      where: {
        action: 'marketplace.listing_created',
        metadata: { path: ['listingId'], equals: dto.listingId },
      },
    });

    if (!listing) throw new NotFoundException('Service listing not found');
    const service = listing.metadata as Record<string, unknown>;
    const priceNGN = service['basePriceNGN'] as number;
    const sellerId = listing.userId;

    // Create Paystack escrow payment
    const paymentRef = `escrow_${bookingId}`;
    let paymentUrl: string | null = null;

    if (this.paystackSecretKey) {
      paymentUrl = await this.createPaystackPaymentLink({
        email: `buyer_${userId}@boldmind.ng`,
        amountKobo: priceNGN * 100,
        reference: paymentRef,
        metadata: { bookingId, userId, sellerId, listingId: dto.listingId, type: 'service_booking' },
      }).catch(() => null);
    }

    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'marketplace.booking_created',
        productSlug: 'boldmind-marketplace',
        metadata: JSON.stringify({
          bookingId,
          listingId: dto.listingId,
          serviceTitle: service['title'],
          priceNGN,
          sellerId,
          requestedDate: dto.requestedDate ?? null,
          notes: dto.notes ?? null,
          deliveryAddress: dto.deliveryAddress ?? null,
          paymentRef,
          status: 'pending_payment',
        }),
      },
    });

    return {
      bookingId,
      serviceTitle: service['title'],
      priceNGN,
      status: 'pending_payment',
      paymentUrl,
      paymentRef,
      escrowNote: 'Your payment is held securely. Funds are released to the provider only after you confirm the work is complete.',
    };
  }

  // ─── GIG Logistics integration ────────────────────────────────────────────────

  async getShippingRates(input: { originState: string; destinationState: string; weightKg: number }) {
    const cacheKey = `marketplace:shipping:${input.originState}:${input.destinationState}:${input.weightKg}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    if (!this.gigApiKey) {
      // Return estimated rates without API
      const baseRate = input.originState === input.destinationState ? 1500 : 3500;
      const weightSurcharge = Math.max(0, (input.weightKg - 1) * 500);
      const result = {
        provider: 'estimate',
        rates: [
          { service: 'GIG Standard', estimatedDays: '2-3', priceNGN: baseRate + weightSurcharge },
          { service: 'GIG Express', estimatedDays: '1',    priceNGN: (baseRate + weightSurcharge) * 1.5 },
        ],
        note: 'Configure GIG_LOGISTICS_API_KEY for live rates.',
      };
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.gigBaseUrl}/api/Shipment/GetDeliveryOptions`,
          { originState: input.originState, destinationState: input.destinationState, weight: input.weightKg },
          { headers: { Authorization: `Bearer ${this.gigApiKey}`, 'Content-Type': 'application/json' } },
        ),
      );

      const result = { provider: 'gig', rates: data, weightKg: input.weightKg };
      await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    } catch (err) {
      this.logger.warn(`GIG API failed: ${String(err)}`);
      return { provider: 'gig_error', error: 'Could not fetch live rates', fallback: 'Contact GIG directly: 0700GIGLOGISTICS' };
    }
  }

  async createShipment(input: {
    senderName: string; senderPhone: string; senderAddress: string; senderState: string;
    recipientName: string; recipientPhone: string; recipientAddress: string; recipientState: string;
    description: string; weightKg: number; valueNGN: number;
  }) {
    if (!this.gigApiKey) {
      return {
        waybillNumber: null,
        message: 'Configure GIG_LOGISTICS_API_KEY to create shipments programmatically.',
        manualOption: 'Visit gig.com or call 0700GIGLOGISTICS to book manually.',
      };
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.gigBaseUrl}/api/Shipment/CreateShipment`,
          {
            SenderName: input.senderName, SenderPhoneNumber: input.senderPhone,
            SenderAddress: input.senderAddress, SenderState: input.senderState,
            ReceiverName: input.recipientName, ReceiverPhoneNumber: input.recipientPhone,
            ReceiverAddress: input.recipientAddress, ReceiverState: input.recipientState,
            ShipmentDescription: input.description, Weight: input.weightKg,
            Value: input.valueNGN,
          },
          { headers: { Authorization: `Bearer ${this.gigApiKey}` } },
        ),
      );
      this.logger.log(`GIG shipment created: ${(data as { WaybillNumber: string }).WaybillNumber}`);
      return { waybillNumber: (data as { WaybillNumber: string }).WaybillNumber, data };
    } catch (err) {
      this.logger.error(`GIG shipment creation failed: ${String(err)}`);
      throw new BadRequestException('Shipment creation failed — please try again or book manually.');
    }
  }

  async trackShipment(waybillNumber: string) {
    if (!this.gigApiKey) {
      return { waybillNumber, status: 'unknown', message: 'Configure GIG_LOGISTICS_API_KEY for tracking.' };
    }

    try {
      const { data } = await firstValueFrom(
        this.http.get(
          `${this.gigBaseUrl}/api/Shipment/TrackShipment/${waybillNumber}`,
          { headers: { Authorization: `Bearer ${this.gigApiKey}` } },
        ),
      );
      return { waybillNumber, ...data as object };
    } catch (err) {
      this.logger.warn(`GIG tracking failed for ${waybillNumber}: ${String(err)}`);
      return { waybillNumber, status: 'tracking_unavailable', error: String(err) };
    }
  }

  // ─── Seller dashboard ─────────────────────────────────────────────────────────

  async getSellerDashboard(userId: string) {
    const [listings, bookings, digitalProducts] = await Promise.all([
      this.prisma.activityLog.count({ where: { userId, action: 'marketplace.listing_created' } }),
      this.prisma.activityLog.findMany({
        where: { action: 'marketplace.booking_created', metadata: { path: ['sellerId'], equals: userId } },
        select: { metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.activityLog.count({ where: { userId, action: 'marketplace.digital_product_created' } }),
    ]);

    const totalEarningsNGN = bookings
      .filter((b) => (b.metadata as Record<string, unknown>)['status'] === 'completed')
      .reduce((s, b) => s + ((b.metadata as Record<string, unknown>)['priceNGN'] as number ?? 0), 0);

    return {
      listings,
      digitalProducts,
      recentBookings: bookings.map((b) => ({ ...(b.metadata as object), createdAt: b.createdAt })),
      totalEarningsNGN,
      pendingBookings: bookings.filter((b) => (b.metadata as Record<string, unknown>)['status'] === 'pending_payment').length,
    };
  }

  // ─── Paystack helpers ─────────────────────────────────────────────────────────

  private async createPaystackPaymentLink(input: {
    email: string; amountKobo: number; reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const { data } = await firstValueFrom(
      this.http.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email: input.email,
          amount: input.amountKobo,
          reference: input.reference,
          metadata: input.metadata,
          callback_url: `${this.config.get('APP_URL', 'https://marketplace.boldmind.ng')}/payment/callback`,
        },
        { headers: { Authorization: `Bearer ${this.paystackSecretKey}` } },
      ),
    );
    return (data as { data: { authorization_url: string } }).data.authorization_url;
  }
}