import {
  IsString, IsOptional, IsEnum, IsNumber, IsBoolean,
  IsArray, IsObject, IsEmail, IsUrl, Min, Max,
  ValidateNested, IsNotEmpty, IsIn, ArrayMaxSize, MinLength, MaxLength, Matches,
  IsInt,
  ArrayMinSize,
  IsPositive,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAIJobType, SubscriptionTier } from '@prisma/client';
import {
  SocialPlatform, PlanAIToolSlug, IndustryBundle,
  NgFestiveCampaign, NG_STATES, NG_LANGUAGES,
  SOCIAL_PLATFORMS, PLANAI_TOOL_SLUGS,
  NG_FESTIVE_CAMPAIGNS
} from '../planai.types';
import { PartialType } from '@nestjs/mapped-types';
import { StoreStatus, WorkspaceRole } from '@prisma/client';

// ─── Order status constant used by UpdateOrderStatusDto + GetOrdersQueryDto ───
const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SUITE DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class OnboardingDto {
  @ApiProperty({ description: 'Business name' })
  @IsString() @IsNotEmpty()
  businessName: string;

  @ApiProperty({ description: 'Business type / industry' })
  @IsString() @IsNotEmpty()
  businessType: string;

  @ApiPropertyOptional({ enum: ['restaurant', 'fashion', 'tech', 'beauty', 'retail', 'agency'] })
  @IsOptional()
  @IsIn(['restaurant', 'fashion', 'tech', 'beauty', 'retail', 'agency'])
  industryBundle?: IndustryBundle;

  @ApiPropertyOptional({ description: 'Nigerian state' })
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedTools?: PlanAIToolSlug[];
}

export class PlanAIScoreQueryDto {
  @ApiPropertyOptional({ description: 'Recompute score even if cached' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  refresh?: boolean;
}

export class MonthlyDigestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(1) @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(2024)
  year?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateJobDto {
  @ApiProperty({ enum: PlanAIJobType })
  @IsEnum(PlanAIJobType)
  type: PlanAIJobType;

  @ApiProperty({ description: 'Job input payload (tool-specific)' })
  @IsObject()
  input: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class JobQueryDto {
  @ApiPropertyOptional({ enum: PlanAIJobType })
  @IsOptional()
  @IsEnum(PlanAIJobType)
  type?: PlanAIJobType;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber() @Min(1)
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsOptional()
  @IsNumber() @Min(1) @Max(100)
  @Transform(({ value }) => Number(value))
  limit?: number = 20;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateTemplateDto {
  @ApiProperty({ enum: PlanAIJobType })
  @IsEnum(PlanAIJobType)
  type: PlanAIJobType;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  prompt: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  exampleOutput?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL MEDIA MANAGER DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateReceptionistDto {
    @ApiProperty({ example: 'My Awesome Business' })
    @IsString()
    businessName: string;

    @ApiPropertyOptional({ example: 'friendly and professional' })
    @IsString()
    @IsOptional()
    tone?: string;

    @ApiPropertyOptional({ example: 'Nigerian business' })
    @IsString()
    @IsOptional()
    businessType?: string;

    @ApiPropertyOptional({ example: 'Hello! How can I help you today?' })
    @IsString()
    @IsOptional()
    greeting?: string;

    @ApiPropertyOptional({ description: 'Knowledge base object containing FAQs' })
    @IsObject()
    @IsOptional()
    knowledgeBase?: Record<string, any>;

    @ApiPropertyOptional({ example: ['manager', 'human', 'complaint', 'supervisor'] })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    escalationTriggers?: string[];

    @ApiPropertyOptional({ description: 'Facebook Page ID' })
    @IsString()
    @IsOptional()
    pageId?: string;

    @ApiPropertyOptional({ description: 'Instagram Business ID' })
    @IsString()
    @IsOptional()
    igBusinessId?: string;

    @ApiPropertyOptional({ description: 'WhatsApp Phone Number ID' })
    @IsString()
    @IsOptional()
    waPhoneNumberId?: string;

    @ApiPropertyOptional({ description: 'Meta App Access Token' })
    @IsString()
    @IsOptional()
    accessToken?: string;
}

export class SendMessageDto {
    @ApiProperty({ example: 'Hello formatting the way you wanted!' })
    @IsString()
    @IsNotEmpty()
    message: string;
}

export class UpdateReceptionistDto extends PartialType(CreateReceptionistDto) {
    @IsBoolean()
    @IsOptional()
    isActive?: boolean;
}

export class GenerateCaptionDto {
  @ApiProperty({ description: 'Post topic or product name' })
  @IsString() @IsNotEmpty()
  topic: string;

  @ApiPropertyOptional({ enum: SOCIAL_PLATFORMS })
  @IsOptional()
  @IsIn(SOCIAL_PLATFORMS)
  platform?: SocialPlatform = 'instagram';

  @ApiPropertyOptional({ description: 'Brand voice description' })
  @IsOptional()
  @IsString()
  brandVoice?: string;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  language?: string = 'english';

  @ApiPropertyOptional({ description: 'Include Pidgin version' })
  @IsOptional()
  @IsBoolean()
  includePidgin?: boolean = false;

  @ApiPropertyOptional({ description: 'Hashtag count', default: 10 })
  @IsOptional()
  @IsNumber() @Min(0) @Max(30)
  hashtagCount?: number = 10;
}

export class SchedulePostDto {
  @ApiProperty({ description: 'Post content' })
  @IsString() @IsNotEmpty()
  content: string;

  @ApiProperty({ isArray: true, enum: SOCIAL_PLATFORMS })
  @IsArray()
  @IsIn(SOCIAL_PLATFORMS, { each: true })
  platforms: SocialPlatform[];

  @ApiPropertyOptional({ description: 'ISO datetime to schedule' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Media URLs' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bestTime?: boolean = false;
}

export class BulkContentDto {
  @ApiProperty({ description: 'Business/product description for content generation' })
  @IsString() @IsNotEmpty()
  businessDescription: string;

  @ApiProperty({ description: 'Number of posts to generate (max 30)', default: 10 })
  @IsNumber() @Min(1) @Max(30)
  count: number;

  @ApiPropertyOptional({ isArray: true, enum: SOCIAL_PLATFORMS })
  @IsOptional()
  @IsArray()
  platforms?: SocialPlatform[];

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  language?: string = 'english';
}

export class AutoReplyConfigDto {
  @ApiProperty({ enum: ['instagram_dm', 'whatsapp', 'facebook_message'] })
  @IsIn(['instagram_dm', 'whatsapp', 'facebook_message'])
  channel: string;

  @ApiProperty({ description: 'FAQ data keyed by question' })
  @IsObject()
  faqData: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  greetingMessage?: string;

  @ApiPropertyOptional({ description: 'Keywords that trigger human escalation' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  escalationKeywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  appointmentEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calendarUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADS CENTER DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateAdCampaignDto {
  @ApiProperty({ enum: ['meta', 'google', 'tiktok'] })
  @IsIn(['meta', 'google', 'tiktok'])
  platform: 'meta' | 'google' | 'tiktok';

  @ApiProperty()
  @IsString() @IsNotEmpty()
  campaignName: string;

  @ApiProperty({ description: 'Daily budget in Naira' })
  @IsNumber() @Min(1000)
  dailyBudgetNGN: number;

  @ApiProperty({ description: 'Campaign objective' })
  @IsIn(['awareness', 'traffic', 'leads', 'sales', 'engagement'])
  objective: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  targeting?: {
    states?: string[];
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    languages?: string[];
  };

  @ApiPropertyOptional({ description: 'Use done-for-you mode (team runs it)' })
  @IsOptional()
  @IsBoolean()
  doneForYou?: boolean = false;

  @ApiPropertyOptional({ enum: [...NG_FESTIVE_CAMPAIGNS] })
  @IsOptional()
  @IsIn(NG_FESTIVE_CAMPAIGNS)
  festiveCampaign?: NgFestiveCampaign;
}

export class GenerateAdCreativeDto {
  @ApiProperty({ description: 'Product or offer description' })
  @IsString() @IsNotEmpty()
  offer: string;

  @ApiProperty({ enum: ['meta', 'google', 'tiktok'] })
  @IsIn(['meta', 'google', 'tiktok'])
  platform: string;

  @ApiPropertyOptional({ description: 'Number of ad copy variants', default: 3 })
  @IsOptional()
  @IsNumber() @Min(1) @Max(10)
  variants?: number = 3;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  language?: string = 'english';
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAND & DIGITAL HOME DTOs
// ─────────────────────────────────────────────────────────────────────────────
export interface IGeneratePortfolioDto {
    name: string; title: string; bio: string; skills: string[];
    experience: Array<{ company: string; role: string; duration: string; achievements: string[] }>;
    education: Array<{ school: string; degree: string; year: string }>;
    projects: Array<{ name: string; description: string; url?: string; imageUrl?: string }>;
    template?: 'modern' | 'minimal' | 'creative';
}
export interface GenerateResumeDto {
    name: string; email: string; phone: string; location: string;
    summary: string; experience: Array<{ company: string; role: string; duration: string; responsibilities: string[] }>;
    education: Array<{ school: string; degree: string; year: string }>;
    skills: string[]; certifications?: string[]; targetRole: string;
}

export class GenerateLogoDto {
  @ApiProperty({ description: 'Business name' })
  @IsString() @IsNotEmpty()
  businessName: string;

  @ApiProperty({ description: 'Business type/industry' })
  @IsString() @IsNotEmpty()
  industry: string;

  @ApiPropertyOptional({ description: 'Style keywords e.g. modern, bold, minimal' })
  @IsOptional()
  @IsString()
  styleKeywords?: string;

  @ApiPropertyOptional({ description: 'Primary colour preference (hex)' })
  @IsOptional()
  @IsString()
  preferredColor?: string;

  @ApiPropertyOptional({ description: 'Include Ankara/Adire motif' })
  @IsOptional()
  @IsBoolean()
  nigerianMotif?: boolean = false;

  @ApiPropertyOptional({ description: 'Number of variations', default: 3 })
  @IsOptional()
  @IsNumber() @Min(1) @Max(5)
  variations?: number = 3;
}

export class GenerateBrandKitDto {
}

export class GenerateFlyerDto {
}

export class GenerateColorPaletteDto {
      @IsString() industry: string;
    @IsString() targetAudience: string;
    @IsOptional() @IsString() mood?: string;
}

export class CreateStoreDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Business category' })
  @IsString() @IsNotEmpty()
  category: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Hex theme colour' })
  @IsOptional()
  @IsString()
  colorTheme?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  instagramShopSync?: boolean = false;

  @IsOptional()
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  logoUrl?: string;

  @IsOptional()
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Paystack subaccount code for payments' })
  @IsOptional()
  @IsString()
  paystackSubAccount?: string;

  @ApiPropertyOptional({ description: 'Physical address for local delivery' })  
  @IsOptional()
  address?: string;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'SUSPENDED'])
  status?: StoreStatus;

  /** Convenience bool → mapped to status ACTIVE / PAUSED internally */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}


export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  /**
   * price in Kobo (₦1 = 100 kobo) — canonical field.
   * Provide either `price` (kobo) OR `priceNGN` (naira). Service normalises both.
   */
  @IsOptional()
  @IsInt({ message: 'price must be an integer in Kobo (e.g. ₦500 = 50000 kobo)' })
  @Min(100, { message: 'Minimum price is ₦1 (100 kobo)' })
  @Max(10_000_000_00)
  price?: number;

  /** priceNGN in Naira — alias kept for backward compat with old planai controller */
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Minimum price is ₦1' })
  priceNGN?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  comparePrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  /** stock / stockQuantity — both accepted */
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  /** imageUrls / images — both accepted */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10, { message: 'Maximum 10 images per product' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @ArrayMaxSize(10)
  images?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @IsOptional()
  @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsUrl({}, { message: 'Download URL must be a valid URL' })
  downloadUrl?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
}

export class AddProductDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Price in Naira' })
  @IsNumber() @Min(0)
  priceNGN: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(0)
  comparePriceNGN?: number;

  @ApiProperty({ description: 'Stock quantity' })
  @IsNumber() @Min(0)
  stock: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class GeneratePortfolioDto {
  @ApiProperty({ description: 'Full name' })
  @IsString() @IsNotEmpty()
  fullName: string;

  @ApiProperty({ description: 'Professional title' })
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Bio / summary' })
  @IsString() @IsNotEmpty()
  bio: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Portfolio template slug' })
  @IsOptional()
  @IsString()
  template?: string;

  @ApiPropertyOptional({ description: 'Custom subdomain e.g. yourname' })
  @IsOptional()
  @IsString()
  subdomain?: string;
}

export class OrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1000)
  quantity: number;
}

export class DeliveryAddressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsIn(NG_STATES, { message: 'Must be a valid Nigerian state' })
  state: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lga: string;
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Order must have at least one item' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  customerName: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  customerEmail: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?234[0-9]{10}$|^0[7-9][0-1][0-9]{8}$/, {
    message: 'Enter a valid Nigerian phone number',
  })
  customerPhone?: string;

  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES, { message: `Status must be one of: ${ORDER_STATUSES.join(', ')}` })
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  trackingCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// ─── QUERY DTOs 

export class GetProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'newest', 'popular'])
  sort?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  maxPrice?: number;
}

export class GetOrdersQueryDto {
  @IsOptional()
  @IsIn([...ORDER_STATUSES, ''])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS INTELLIGENCE SUITE DTOs
// ─────────────────────────────────────────────────────────────────────────────
export class GeneratePitchDeckDto {
    @IsString() businessName: string;
    @IsString() industry: string;
    @IsString() problemStatement: string;
    @IsString() solution: string;
    @IsString() teamBackground: string;
    @IsOptional() @IsString() traction?: string;
    @IsOptional() @IsNumber() @IsPositive() fundingAskNGN?: number;
    @IsOptional() @IsString() targetMarket?: string;
}
export class GenerateBusinessPlanDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  businessName: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  industry: string;

  @ApiProperty({ description: 'Brief description of the business' })
  @IsString() @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Target Nigerian state(s)' })
  @IsOptional()
  @IsArray()
  @IsIn(NG_STATES, { each: true })
  targetStates?: string[];

  @ApiPropertyOptional({ description: 'Monthly revenue target in Naira' })
  @IsOptional()
  @IsNumber() @Min(0)
  revenueTargetNGN?: number;

  @ApiPropertyOptional({ description: 'Startup capital in Naira' })
  @IsOptional()
  @IsNumber() @Min(0)
  startupCapitalNGN?: number;

  @ApiProperty({ description: 'Output format', enum: ['pdf', 'docx', 'json'] })
  @IsIn(['pdf', 'docx', 'json'])
  outputFormat: 'pdf' | 'docx' | 'json';

  @ApiPropertyOptional({ description: 'Bank loan ready format' })
  @IsOptional()
  @IsBoolean()
  bankLoanFormat?: boolean = false;
}

export class FinancialForecastDto {
  @ApiPropertyOptional({ description: 'Starting monthly revenue in Naira' })
  @IsOptional()
  @IsNumber() @Min(0)
  currentMonthlyRevenueNGN?: number;

  @ApiPropertyOptional({ description: 'Monthly expenses in Naira' })
  @IsOptional()
  @IsNumber() @Min(0)
  monthlyExpensesNGN?: number;

  @ApiProperty({ description: 'Forecast months (3, 6, or 12)', enum: [3, 6, 12] })
  @IsIn([3, 6, 12])
  forecastMonths: number;

  @ApiPropertyOptional({ description: 'Expected monthly growth rate %' })
  @IsOptional()
  @IsNumber() @Min(0) @Max(100)
  growthRatePercent?: number;

  @ApiPropertyOptional({ description: 'Include FX impact modelling' })
  @IsOptional()
  @IsBoolean()
  includeFXImpact?: boolean = false;

  @ApiPropertyOptional({ description: 'Scenario: base, best, worst', enum: ['base', 'best', 'worst', 'all'] })
  @IsOptional()
  @IsIn(['base', 'best', 'worst', 'all'])
  scenario?: string = 'base';
}

export class GenerateForecastDto {
    @IsString()
    businessName: string;

    @IsString()
    industry: string;

    @IsNumber()
    currentMonthlyRevenue: number;

    @IsNumber()
    expectedGrowthPercent: number;

    @IsNumber()
    fixedExpensesNGN: number;

    @IsNumber()
    variableCostPercent: number;

    @IsNumber()
    startingCashNGN: number;

    @IsArray()
    @IsString({ each: true })
    revenueSources: string[];

    @IsOptional()
    @IsString()
    upcomingExpenses?: string;

    @IsOptional()
    @IsString()
    context?: string;
}

export class GenerateScenarioDto extends GenerateForecastDto { }

export class CalculateBreakEvenDto {
    @IsNumber()
    fixedCostsNGN: number;

    @IsNumber()
    variableCostPerUnit: number;

    @IsNumber()
    pricePerUnit: number;

    @IsOptional()
    @IsNumber()
    currentUnits?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// INVESTOR READINESS DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class GenerateSafeDto {
  @ApiProperty({ description: 'Company name' })
  @IsString() @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Investor name or entity' })
  @IsString() @IsNotEmpty()
  investorName: string;

  @ApiProperty({ description: 'Investment amount in Naira' })
  @IsNumber() @Min(0)
  investmentAmountNGN: number;

  @ApiPropertyOptional({ description: 'Valuation cap in Naira' })
  @IsOptional()
  @IsNumber() @Min(0)
  valuationCapNGN?: number;

  @ApiPropertyOptional({ description: 'Discount rate %' })
  @IsOptional()
  @IsNumber() @Min(0) @Max(50)
  discountRatePercent?: number;

  @ApiPropertyOptional({ description: 'CAC registration number' })
  @IsOptional()
  @IsString()
  cacRegNumber?: string;
}

export class DataRoomDto {
  @ApiProperty({ description: 'Startup name' })
  @IsString() @IsNotEmpty()
  startupName: string;

  @ApiPropertyOptional({ description: 'Document categories to create' })
  @IsOptional()
  @IsArray()
  @IsIn(['financials', 'legal', 'team', 'product', 'market', 'pitch'], { each: true })
  sections?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETING AUTOMATION DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateCampaignDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['email', 'whatsapp', 'sms'] })
  @IsIn(['email', 'whatsapp', 'sms'])
  channel: 'email' | 'whatsapp' | 'sms';

  @ApiProperty({ description: 'Campaign message content' })
  @IsString() @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Subject line (email only)' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Recipient segment filter' })
  @IsOptional()
  @IsObject()
  segmentFilter?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Schedule ISO datetime' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: [...NG_FESTIVE_CAMPAIGNS] })
  @IsOptional()
  @IsIn(NG_FESTIVE_CAMPAIGNS)
  festiveCampaign?: NgFestiveCampaign;
}

export class CreateDripSequenceDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['email', 'whatsapp'] })
  @IsIn(['email', 'whatsapp'])
  channel: 'email' | 'whatsapp';

  @ApiProperty({ description: 'Trigger event e.g. new_signup, purchase, abandoned_cart' })
  @IsString() @IsNotEmpty()
  trigger: string;

  @ApiProperty({ description: 'Array of steps with content and delay' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DripStepDto)
  steps: DripStepDto[];
}

export class DripStepDto {
  @ApiProperty({ description: 'Delay in hours after trigger or previous step' })
  @IsNumber() @Min(0)
  delayHours: number;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;
}

export class CreateWhatsAppBroadcastDto {
  @ApiProperty({ description: 'Broadcast message content' })
  @IsString() @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Recipient segment filter' })
  @IsOptional()
  @IsObject()
  segmentFilter?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Schedule ISO datetime' })
  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ enum: [...NG_FESTIVE_CAMPAIGNS] })
  @IsOptional()
  @IsIn(NG_FESTIVE_CAMPAIGNS)
  festiveCampaign?: NgFestiveCampaign;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS DISCOVERY DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class SearchBusinessesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ enum: NG_STATES })
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional({ description: 'LGA filter' })
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ description: 'Business size', enum: ['micro', 'small', 'medium', 'large'] })
  @IsOptional()
  @IsIn(['micro', 'small', 'medium', 'large'])
  size?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber() @Min(1)
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsNumber() @Min(1) @Max(100)
  @Transform(({ value }) => Number(value))
  limit?: number = 20;
}

export class FindContactsDto {
  @ApiProperty({ description: 'Company name or domain' })
  @IsString() @IsNotEmpty()
  company: string;

  @ApiPropertyOptional({ description: 'Job title filter e.g. CEO, Procurement' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: 'Verify email via SMTP', default: true })
  @IsOptional()
  @IsBoolean()
  verify?: boolean = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI BUSINESS AGENT DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class ConfigureAgentDto {
  @ApiProperty({ description: 'Business context for the AI agent' })
  @IsString() @IsNotEmpty()
  businessContext: string;

  @ApiProperty({ description: 'FAQ knowledge base' })
  @IsObject()
  faqData: Record<string, string>;

  @ApiPropertyOptional({ description: 'Agent persona name' })
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ description: 'Channels to activate' })
  @IsOptional()
  @IsArray()
  @IsIn(['whatsapp', 'instagram_dm', 'email'], { each: true })
  channels?: string[];

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  language?: string = 'english';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  invoiceFollowUpEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  appointmentEnabled?: boolean = false;

    @ApiPropertyOptional()
    @IsOptional()
    calendarUrl?: string;
}

export class AgentTaskDto {
  @ApiProperty({ description: 'Task type', enum: ['invoice_followup', 'appointment_booking', 'order_update', 'supplier_comms'] })
  @IsIn(['invoice_followup', 'appointment_booking', 'order_update', 'supplier_comms'])
  taskType: string;

  @ApiProperty({ description: 'Task-specific payload' })
  @IsObject()
  payload: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT MANAGER DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateWorkspaceDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateWorkspaceDto {
}

export class InviteMemberDto {
    @ApiProperty({ example: 'member@example.com' })
    @IsEmail()
    email: string;

    @ApiPropertyOptional({ example: 'MEMBER', enum: WorkspaceRole })
    @IsOptional()
    @IsEnum(WorkspaceRole)
    role?: WorkspaceRole;
}

export class CreateProjectDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  workspaceId: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateTaskDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  workspaceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'])
  status?: string = 'TODO';

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string = 'MEDIUM';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'ISO date string' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(1)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: 'Parent task ID for subtasks' })
  @IsOptional()
  @IsString()
  parentTaskId?: string;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class StartPomodoroDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskId?: string;

  @ApiProperty({ description: 'Duration in minutes', default: 25 })
  @IsNumber() @Min(1) @Max(90)
  durationMinutes: number;

  @ApiPropertyOptional({ enum: ['work', 'break', 'long_break'] })
  @IsOptional()
  @IsIn(['work', 'break', 'long_break'])
  type?: string = 'work';
}

// ─────────────────────────────────────────────────────────────────────────────
// CRM DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateContactDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Custom notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Tags for segmentation' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class CreateDealDto {
  @ApiProperty({ description: 'Contact ID' })
  @IsString() @IsNotEmpty()
  contactId: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Deal value in Naira' })
  @IsNumber() @Min(0)
  valueNGN: number;

  @ApiPropertyOptional({ enum: ['NEW', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'] })
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'])
  stage?: string = 'NEW';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expectedCloseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HR & PAYROLL DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateEmployeeDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  firstName: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  role: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ description: 'Monthly gross salary in Naira' })
  @IsNumber() @Min(0)
  monthlySalaryNGN: number;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Pension Fund Administrator code' })
  @IsOptional()
  @IsString()
  pfaCode?: string;
}

export class RunPayrollDto {
  @ApiProperty({ description: 'Payroll month 1-12' })
  @IsNumber() @Min(1) @Max(12)
  month: number;

  @ApiProperty({ description: 'Payroll year' })
  @IsNumber() @Min(2024)
  year: number;

  @ApiPropertyOptional({ description: 'Specific employee IDs (empty = all active)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ description: 'Generate salary bank upload file' })
  @IsOptional()
  @IsBoolean()
  generateBankFile?: boolean = false;

  @ApiPropertyOptional({ description: 'Delivery payslips via WhatsApp' })
  @IsOptional()
  @IsBoolean()
  deliverPayslips?: boolean = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE DTOs
// ─────────────────────────────────────────────────────────────────────────────

export class CreateServiceListingDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Service category e.g. design, photography, catering' })
  @IsString() @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Base price in Naira' })
  @IsNumber() @Min(0)
  basePriceNGN: number;

  @ApiPropertyOptional({ description: 'Video showcase URL (30-second clip)' })
  @IsOptional()
  @IsString()
  videoShowcaseUrl?: string;

  @ApiPropertyOptional({ enum: NG_STATES })
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ description: 'Same-day or next-day availability' })
  @IsOptional()
  @IsIn(['same_day', 'next_day', 'scheduled'])
  availability?: string;
}

export class CreateDigitalProductDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Product type e.g. template, course, ebook, tool' })
  @IsIn(['template', 'course', 'ebook', 'tool', 'download'])
  productType: string;

  @ApiProperty({ description: 'Price in Naira (0 = free)' })
  @IsNumber() @Min(0)
  priceNGN: number;

  @ApiProperty({ description: 'Download file URL (Cloudflare R2)' })
  @IsString() @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class BookServiceDto {
  @ApiProperty({ description: 'Service listing ID' })
  @IsString() @IsNotEmpty()
  listingId: string;

  @ApiPropertyOptional({ description: 'Requested date ISO string' })
  @IsOptional()
  @IsString()
  requestedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsOptional()
  @IsObject()
  deliveryAddress?: Record<string, string>;
}