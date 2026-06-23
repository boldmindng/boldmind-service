import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { AiService } from '../../ai/ai.service';
import { FalProvider } from '../../ai/providers/fal.provider';
import {
  GenerateLogoDto, CreateStoreDto, AddProductDto, GeneratePortfolioDto,
} from '../dto/all-planai.dto';

@Injectable()
export class BrandHomeService {
  private readonly logger = new Logger(BrandHomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly fal: FalProvider,
    private readonly config: ConfigService,
  ) {}

  // ─── Logo generation ─────────────────────────────────────────────────────────

  async generateLogo(userId: string, dto: GenerateLogoDto) {
    const motifNote = dto.nigerianMotif
      ? 'Incorporate subtle Nigerian cultural motifs: Adire indigo patterns, Aso-Oke weave geometry, or Ankara bold print elements woven into the design.'
      : '';
    const colorNote = dto.preferredColor ? `Dominant colour: ${dto.preferredColor}.` : '';

    const logoPrompt = `Professional logo design for "${dto.businessName}", a Nigerian ${dto.industry} company.
Style: ${dto.styleKeywords ?? 'modern, clean, minimal, professional'}.
${colorNote} ${motifNote}
Clean vector-style design. White or transparent background.
Company name in a clean sans-serif font if text is included.
High quality commercial logo, suitable for business cards, websites, social media.`;

    const logoUrls: string[] = [];

    try {
      // fal.ai FLUX Pro — highest quality logos
      const result = await this.fal.generateImage({
        prompt: logoPrompt,
        model: 'flux-pro',
        aspectRatio: 'square_hd',
        numImages: dto.variations ?? 3,
      });

      if (result.images?.length) {
        logoUrls.push(...result.images.map((img) => img.url));
      } else if (result.imageUrl) {
        logoUrls.push(result.imageUrl);
      }
    } catch (err) {
      this.logger.warn(`fal.ai logo gen failed, trying SDXL fallback: ${String(err)}`);
      // Fallback via AiService which handles CF SDXL
      const fallback = await this.ai.generateLogo({
        brandName: dto.businessName,
        industry: dto.industry,
        style: dto.styleKeywords ?? 'modern professional',
        colors: dto.preferredColor ? [dto.preferredColor] : ['#2B4D87', '#059669'],
        additionalDetails: motifNote,
      });
      if (fallback.url) logoUrls.push(fallback.url);
    }

    await this.logActivity(userId, 'brand.logo_generated', { businessName: dto.businessName, variations: logoUrls.length });

    return {
      businessName: dto.businessName,
      logoUrls,
      variations: logoUrls.length,
      prompt: logoPrompt,
    };
  }

  // ─── Brand colour palette ─────────────────────────────────────────────────────

  async generateBrandPalette(userId: string, input: { industry: string; vibe?: string }) {
    const result = await this.ai.generateJson<{
      primary: { hex: string; name: string; usage: string };
      secondary: { hex: string; name: string; usage: string };
      accent: { hex: string; name: string; usage: string };
      neutral: { hex: string; name: string; usage: string };
      background: { hex: string; name: string; usage: string };
      typography: { heading: string; body: string };
      reasoning: string;
    }>(
      'You are a professional brand designer specialising in Nigerian businesses. Valid JSON only.',
      `Generate a professional brand colour palette for a Nigerian ${input.industry} business.
Vibe: ${input.vibe ?? 'modern, trustworthy, approachable'}
Consider Nigerian cultural colour associations and what resonates with Nigerian consumers.

Return JSON: {
  primary, secondary, accent, neutral, background — each: { hex, name, usage },
  typography: { heading (Google Font name), body (Google Font name) },
  reasoning (why these colours work for this Nigerian market segment)
}`,
      { task: 'creative', temperature: 0.7, cacheTtl: 86400 },
    );

    await this.logActivity(userId, 'brand.palette_generated', { industry: input.industry });
    return result.content;
  }

  // ─── Store management ────────────────────────────────────────────────────────

  async createStore(userId: string, dto: CreateStoreDto) {
    const slug = `${dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 30)}-${Date.now().toString(36)}`;

    const store = await this.prisma.store.create({
      data: {
        userId,
        slug,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        whatsappNumber: dto.whatsappNumber,
        state: dto.state,
        colorTheme: dto.colorTheme ?? '#059669',
        status: 'ACTIVE',
      },
    });

    await this.logActivity(userId, 'brand.store_created', { storeName: dto.name, slug });

    return {
      ...store,
      storeUrl: `https://planai.boldmind.ng/brand/store/${slug}`,
      shareableLink: `https://boldmind.ng/store/${slug}`,
      nextSteps: [
        'Add your first product',
        'Connect Paystack in Settings → Payments',
        'Share your store link on WhatsApp Status and Instagram bio',
        dto.instagramShopSync ? 'Connect Instagram Shop in Settings → Integrations' : null,
      ].filter(Boolean),
    };
  }

  async getMyStores(userId: string) {
    return this.prisma.store.findMany({
      where: { userId },
      include: { _count: { select: { products: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addProduct(userId: string, storeId: string, dto: AddProductDto) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found or you do not own it');

    return this.prisma.product.create({
      data: {
        storeId,
        name: dto.name,
        description: dto.description,
        price: Math.round(dto.priceNGN * 100),
        comparePrice: dto.comparePriceNGN ? Math.round(dto.comparePriceNGN * 100) : undefined,
        stock: dto.stock,
        category: dto.category,
        imageUrls: dto.imageUrls ?? [],
        tags: dto.tags ?? [],
        trackInventory: true,
        isActive: true,
      },
    });
  }

  async getStoreProducts(userId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found');
    return this.prisma.product.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  }

  async getStoreOrders(userId: string, storeId: string) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, userId } });
    if (!store) throw new NotFoundException('Store not found');
    return this.prisma.order.findMany({
      where: { storeId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ─── Portfolio generator ─────────────────────────────────────────────────────

  async generatePortfolio(userId: string, dto: GeneratePortfolioDto) {
    const result = await this.ai.generateJson<{
      headline: string;
      elevatorPitch: string;
      bioLong: string;
      bioShort: string;
      linkedinHeadline: string;
      linkedinSummary: string;
      uniqueValue: string;
      nigerianMarketPositioning: string;
      suggestedProjectTitles: string[];
    }>(
      'You are a Nigerian professional branding expert. Valid JSON only.',
      `Generate professional portfolio content for a Nigerian professional.
Name: ${dto.fullName}, Title: ${dto.title}
Bio: ${dto.bio}
Skills: ${dto.skills?.join(', ') ?? 'not specified'}

Return JSON: { headline, elevatorPitch (2 sentences, first person), bioLong (150-word third-person),
bioShort (50-word), linkedinHeadline (120 chars max), linkedinSummary (2000 chars max),
uniqueValue (single sentence), nigerianMarketPositioning, suggestedProjectTitles: [5 project titles] }`,
      { task: 'creative', temperature: 0.7 },
    );

    const subdomain = dto.subdomain ?? dto.fullName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    await this.logActivity(userId, 'brand.portfolio_generated', { fullName: dto.fullName });

    return {
      portfolioContent: result.content,
      template: dto.template ?? 'professional',
      portfolioUrl: `https://planai.boldmind.ng/brand/p/${subdomain}`,
      customDomain: `${subdomain}.boldmind.ng`,
    };
  }

  // ─── Resume generator ─────────────────────────────────────────────────────────

  async generateResume(userId: string, input: {
    fullName: string; currentRole: string; experience: string;
    skills: string[]; education: string; targetRole?: string;
  }) {
    const result = await this.ai.generateJson<{
      summary: string;
      experience: Array<{ role: string; company: string; duration: string; achievements: string[] }>;
      education: Array<{ degree: string; institution: string; year: string }>;
      skills: { technical: string[]; soft: string[] };
      certifications: string[];
    }>(
      'You are a professional CV writer for the Nigerian job market and international applications. Valid JSON only.',
      `Generate an ATS-friendly CV for a Nigerian professional.
Name: ${input.fullName}, Current role: ${input.currentRole}
Target role: ${input.targetRole ?? 'open'}
Experience: ${input.experience}
Skills: ${input.skills.join(', ')}
Education: ${input.education}

Return JSON: { summary (3-sentence profile), experience: [{ role, company, duration, achievements: [quantified bullets] }],
education: [{ degree, institution, year }], skills: { technical: [], soft: [] }, certifications: [] }
Use strong action verbs. Quantify achievements where possible.`,
      { task: 'reasoning', temperature: 0.6 },
    );

    await this.logActivity(userId, 'brand.resume_generated', { fullName: input.fullName });
    return result.content;
  }

  // ─── WhatsApp flyer ───────────────────────────────────────────────────────────

  async generateWhatsAppFlyer(userId: string, input: {
    businessName: string; offer: string; price?: string;
    style?: 'modern' | 'traditional' | 'luxury' | 'playful';
  }) {
    // Uses CloudflareAiProvider.generateWhatsAppFlyer under the hood via AiService
    const image = await this.ai.generateSocialImage(
      `Professional WhatsApp business flyer. Business: "${input.businessName}". 
Offer: "${input.offer}". ${input.price ? `Price: ${input.price}.` : ''}
Style: ${input.style ?? 'modern'}. Nigerian market. Portrait format.`,
      'whatsapp-flyer',
    );

    await this.logActivity(userId, 'brand.flyer_generated', { businessName: input.businessName });
    return { image, businessName: input.businessName, offer: input.offer };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'brand-digital-home', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}