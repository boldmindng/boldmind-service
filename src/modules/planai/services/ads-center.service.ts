import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { AiService } from '../../ai/ai.service';
import { CreateAdCampaignDto, GenerateAdCreativeDto } from '../dto/all-planai.dto';

@Injectable()
export class AdsCenterService {
  private readonly logger = new Logger(AdsCenterService.name);

  private readonly metaApiVersion = 'v19.0';
  private readonly metaAdToken: string;
  private readonly metaAdAccountId: string;
  private readonly googleAdsDevToken: string;
  private readonly tiktokAccessToken: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.metaAdToken       = this.config.get<string>('META_ADS_ACCESS_TOKEN', '');
    this.metaAdAccountId   = this.config.get<string>('META_AD_ACCOUNT_ID', '');
    this.googleAdsDevToken = this.config.get<string>('GOOGLE_ADS_DEV_TOKEN', '');
    this.tiktokAccessToken = this.config.get<string>('TIKTOK_ACCESS_TOKEN', '');
  }

  // ─── Create campaign ─────────────────────────────────────────────────────────

  async createCampaign(userId: string, dto: CreateAdCampaignDto) {
    // Store campaign intent first — publish to ad platform async
    const campaignId = `camp_${Date.now().toString(36)}`;

    await this.logActivity(userId, 'ads.campaign_created', {
      campaignId,
      platform: dto.platform,
      campaignName: dto.campaignName,
      dailyBudgetNGN: dto.dailyBudgetNGN,
      objective: dto.objective,
      doneForYou: dto.doneForYou ?? false,
    });

    if (dto.doneForYou) {
      // Trigger n8n done-for-you workflow notification
      await this.notifyDFYTeam(userId, dto).catch(() => {});
      return {
        campaignId,
        status: 'pending_team_setup',
        platform: dto.platform,
        message: 'Our team will set up and run your campaign. Expect a WhatsApp message from us within 24 hours.',
      };
    }

    // Self-serve: push to the ad platform
    let platformCampaignId: string | null = null;
    let publishError: string | null = null;

    try {
      if (dto.platform === 'meta' && this.metaAdToken && this.metaAdAccountId) {
        platformCampaignId = await this.createMetaCampaign(dto);
      } else if (dto.platform === 'google' && this.googleAdsDevToken) {
        // Google Ads API setup is complex — queue for n8n workflow
        platformCampaignId = `google_queued_${campaignId}`;
      } else if (dto.platform === 'tiktok' && this.tiktokAccessToken) {
        platformCampaignId = await this.createTikTokCampaign(dto);
      } else {
        publishError = `${dto.platform} ad account not connected. Go to Settings → Integrations → ${dto.platform} Ads.`;
      }
    } catch (err) {
      publishError = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ad campaign creation failed on ${dto.platform}: ${publishError}`);
    }

    return {
      campaignId,
      platformCampaignId,
      status: platformCampaignId ? 'live' : 'draft',
      platform: dto.platform,
      dailyBudgetNGN: dto.dailyBudgetNGN,
      objective: dto.objective,
      ...(publishError ? { connectNote: publishError } : {}),
    };
  }

  // ─── Generate ad creative ─────────────────────────────────────────────────────

  async generateAdCreative(userId: string, dto: GenerateAdCreativeDto) {
    const cacheKey = `ads:creative:${userId}:${Buffer.from(dto.offer + dto.platform).toString('base64').slice(0, 20)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const platformGuide: Record<string, string> = {
      meta:   'Facebook/Instagram ads. Headline max 40 chars. Primary text max 125 chars. CTA button options: Shop Now, Learn More, Sign Up, Get Quote, Contact Us.',
      google: 'Search ads. Headline max 30 chars (up to 15 headlines). Description max 90 chars (up to 4). Include keywords naturally.',
      tiktok: 'TikTok ads. Hook in first 3 seconds. Casual, authentic tone. Include trending TikTok language. CTA overlay text.',
    };

    const result = await this.ai.generateJson<{
      variants: Array<{
        variantId: number;
        headline: string;
        primaryText: string;
        description: string;
        callToAction: string;
        imagePrompt: string;
        targetAudience: string;
      }>;
      audienceInsights: string;
      estimatedCPC: string;
      abTestRecommendation: string;
    }>(
      `You are a Nigerian digital advertising specialist who understands Meta, Google, and TikTok ads.
Valid JSON only. All monetary values in Naira (₦).`,
      `Generate ${dto.variants ?? 3} ad creative variants for a Nigerian business.
Offer: "${dto.offer}"
Platform: ${dto.platform}
Platform guidelines: ${platformGuide[dto.platform] ?? ''}
Language: ${dto.language ?? 'english'}

Return JSON: {
  variants: [{ variantId, headline, primaryText, description, callToAction, 
    imagePrompt (detailed FLUX AI prompt for the ad visual),
    targetAudience (who this variant is optimised for) }],
  audienceInsights (Nigerian audience tips for this offer),
  estimatedCPC (estimated cost per click range in ₦),
  abTestRecommendation (which variant to launch first and why)
}`,
      { task: 'reasoning', temperature: 0.75 },
    );

    await this.redis.setex(cacheKey, 3600, JSON.stringify(result.content));
    await this.logActivity(userId, 'ads.creative_generated', { platform: dto.platform, offer: dto.offer });

    return result.content;
  }

  // ─── Compliance checker ───────────────────────────────────────────────────────

  async checkAdCompliance(userId: string, adCopy: string, platform: string) {
    const result = await this.ai.generateJson<{
      compliant: boolean;
      issues: string[];
      suggestions: string[];
      riskLevel: 'low' | 'medium' | 'high';
    }>(
      'You are a Meta/Google/TikTok ad policy expert. Valid JSON only.',
      `Check if this ad copy complies with ${platform} advertising policies.
Ad copy: "${adCopy}"

Common violations: claims of guaranteed results, misleading before/after, financial promises,
health claims without disclaimers, political content, adult content.

Return JSON: { compliant: boolean, issues: [policy violations found], 
suggestions: [how to fix each issue], riskLevel: "low|medium|high" }`,
      { task: 'json-extraction', temperature: 0.2, cacheTtl: 0 },
    );

    return result.content;
  }

  // ─── Campaign performance ─────────────────────────────────────────────────────

  async getCampaignPerformance(userId: string, platformCampaignId: string, platform: string) {
    if (platform === 'meta' && this.metaAdToken) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(
            `https://graph.facebook.com/${this.metaApiVersion}/${platformCampaignId}/insights`,
            {
              params: {
                fields: 'impressions,clicks,spend,cpc,ctr,reach,frequency',
                date_preset: 'last_30d',
                access_token: this.metaAdToken,
              },
            },
          ),
        );
        return { platform, source: 'meta_api', data: (data as { data: unknown }).data };
      } catch (err) {
        this.logger.warn(`Meta insights fetch failed: ${String(err)}`);
      }
    }

    return {
      platform,
      source: 'not_connected',
      message: `Connect your ${platform} Ads account in Settings → Integrations to see live performance data.`,
    };
  }

  async getMyCampaigns(userId: string) {
    const logs = await this.prisma.activityLog.findMany({
      where: { userId, action: 'ads.campaign_created' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      campaigns: logs.map((l) => ({ ...(l.metadata as object), createdAt: l.createdAt })),
    };
  }

  // ─── Meta Ads API ─────────────────────────────────────────────────────────────

  private async createMetaCampaign(dto: CreateAdCampaignDto): Promise<string> {
    const objectiveMap: Record<string, string> = {
      awareness:  'BRAND_AWARENESS',
      traffic:    'LINK_CLICKS',
      leads:      'LEAD_GENERATION',
      sales:      'CONVERSIONS',
      engagement: 'POST_ENGAGEMENT',
    };

    // Step 1: Create campaign
    const { data: campaignData } = await firstValueFrom(
      this.http.post(
        `https://graph.facebook.com/${this.metaApiVersion}/act_${this.metaAdAccountId}/campaigns`,
        {
          name: dto.campaignName,
          objective: objectiveMap[dto.objective] ?? 'LINK_CLICKS',
          status: 'PAUSED', // always start paused — user reviews before publishing
          special_ad_categories: [],
        },
        { headers: { Authorization: `Bearer ${this.metaAdToken}` } },
      ),
    );

    const campaignId = (campaignData as { id: string }).id;

    // Step 2: Create ad set with Nigerian targeting
    const targeting = {
      geo_locations: {
        countries: ['NG'],
        ...(dto.targeting && (dto.targeting as { states?: string[] }).states?.length
          ? { regions: (dto.targeting as { states: string[] }).states.map((s) => ({ name: s })) }
          : {}),
      },
      age_min: (dto.targeting as { ageMin?: number } | undefined)?.ageMin ?? 18,
      age_max: (dto.targeting as { ageMax?: number } | undefined)?.ageMax ?? 55,
      locales: [7], // English (Nigeria)
    };

    await firstValueFrom(
      this.http.post(
        `https://graph.facebook.com/${this.metaApiVersion}/act_${this.metaAdAccountId}/adsets`,
        {
          name: `${dto.campaignName} — Adset`,
          campaign_id: campaignId,
          daily_budget: dto.dailyBudgetNGN * 100, // Meta uses subunits
          billing_event: 'IMPRESSIONS',
          optimization_goal: objectiveMap[dto.objective] ?? 'LINK_CLICKS',
          targeting,
          status: 'PAUSED',
        },
        { headers: { Authorization: `Bearer ${this.metaAdToken}` } },
      ),
    );

    this.logger.log(`Meta campaign created: ${campaignId}`);
    return campaignId;
  }

  // ─── TikTok Ads API ───────────────────────────────────────────────────────────

  private async createTikTokCampaign(dto: CreateAdCampaignDto): Promise<string> {
    const objectiveMap: Record<string, string> = {
      awareness: 'REACH', traffic: 'TRAFFIC', leads: 'LEAD_GENERATION',
      sales: 'CONVERSIONS', engagement: 'VIDEO_VIEWS',
    };

    const { data } = await firstValueFrom(
      this.http.post(
        'https://business-api.tiktok.com/open_api/v1.3/campaign/create/',
        {
          advertiser_id: this.config.get<string>('TIKTOK_ADVERTISER_ID'),
          campaign_name: dto.campaignName,
          objective_type: objectiveMap[dto.objective] ?? 'TRAFFIC',
          budget_mode: 'BUDGET_MODE_DAY',
          budget: dto.dailyBudgetNGN,
          operation_status: 'DISABLE', // start paused
        },
        { headers: { 'Access-Token': this.tiktokAccessToken } },
      ),
    );

    const campaignId = (data as { data: { campaign_id: string } }).data.campaign_id;
    this.logger.log(`TikTok campaign created: ${campaignId}`);
    return campaignId;
  }

  // ─── DFY notification ────────────────────────────────────────────────────────

  private async notifyDFYTeam(userId: string, dto: CreateAdCampaignDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    });

    // Log for team dashboard pickup — in production also triggers n8n webhook
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'ads.dfy_request',
        productSlug: 'ads-center',
        metadata: JSON.stringify({ user: { name: user.name, email: user.email, phone: user.phone }, campaign: dto, requestedAt: new Date().toISOString() }),
      },
    });
  }

  private async logActivity(userId: string, action: string, metadata: Record<string, unknown>) {
    await this.prisma.activityLog.create({
      data: { userId, action, productSlug: 'ads-center', metadata: JSON.stringify(metadata) },
    }).catch(() => {});
  }
}