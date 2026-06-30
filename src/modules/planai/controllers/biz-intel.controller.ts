import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { BizIntelService } from "../services/biz-intel.service";
import { InvestorKitService } from "../services/investor-kit.service";
import { MarketingAutoService } from "../services/marketing-auto.service";
import { BizDirectoryService } from "../services/biz-directory.service";
import {
  GenerateBusinessPlanDto,
  FinancialForecastDto,
  GenerateSafeDto,
  DataRoomDto,
  CreateCampaignDto,
  CreateDripSequenceDto,
  SearchBusinessesDto,
  FindContactsDto,
} from "../dto/all-planai.dto";

interface AuthRequest extends Request {
  user: { id: string };
}

// ═════════════════════════════════════════════════════════════════════════════
// BUSINESS INTELLIGENCE
// ═════════════════════════════════════════════════════════════════════════════
@ApiTags("PlanAI / Business Intelligence")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/intelligence")
export class BizIntelController {
  constructor(private readonly svc: BizIntelService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Live analytics dashboard across all tools" })
  getDashboard(@Req() req: AuthRequest) {
    return this.svc.getAnalyticsDashboard(req.user.id);
  }

  @Post("business-plan")
  @ApiOperation({ summary: "Queue AI business plan generation (job-based)" })
  generatePlan(@Req() req: AuthRequest, @Body() dto: GenerateBusinessPlanDto) {
    return this.svc.generateBusinessPlan(req.user.id, dto);
  }

  @Post("forecast")
  @ApiOperation({
    summary: "Queue financial forecast (enriched with live Paystack data)",
  })
  generateForecast(@Req() req: AuthRequest, @Body() dto: FinancialForecastDto) {
    return this.svc.generateFinancialForecast(req.user.id, dto);
  }

  @Post("pitch-deck")
  @ApiOperation({ summary: "Queue 10-slide pitch deck generation" })
  generatePitchDeck(
    @Req() req: AuthRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.svc.generatePitchDeck(req.user.id, body);
  }

  @Post("swot")
  @ApiOperation({ summary: "Generate SWOT analysis (synchronous)" })
  generateSwot(
    @Req() req: AuthRequest,
    @Body()
    body: { businessName: string; industry: string; description: string },
  ) {
    return this.svc.generateSwot(req.user.id, body);
  }

  @Get("market/:industry")
  @ApiOperation({ summary: "Nigerian market size and competitor analysis" })
  getMarketAnalysis(
    @Req() req: AuthRequest,
    @Param("industry") industry: string,
    @Query("states") states?: string,
  ) {
    return this.svc.getMarketAnalysis(req.user.id, {
      industry,
      targetStates: states ? states.split(",") : undefined,
    });
  }

  @Post("break-even")
  @ApiOperation({ summary: "Break-even calculator" })
  breakEven(
    @Body()
    body: {
      fixedCostsNGN: number;
      variableCostPerUnitNGN: number;
      sellingPricePerUnitNGN: number;
    },
  ) {
    return this.svc.calculateBreakEven(body);
  }

  @Get("regulatory/:industry")
  @ApiOperation({ summary: "Nigerian regulatory checklist for industry" })
  getRegulatoryChecklist(@Param("industry") industry: string) {
    return this.svc.getRegulatoryChecklist(industry);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// INVESTOR READINESS
// ═════════════════════════════════════════════════════════════════════════════
@ApiTags("PlanAI / Investor Readiness")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/investor")
export class InvestorKitController {
  constructor(private readonly svc: InvestorKitService) {}

  @Post("safe")
  @ApiOperation({
    summary: "Generate SAFE note document + data room checklist",
  })
  generateSafe(@Req() req: AuthRequest, @Body() dto: GenerateSafeDto) {
    return this.svc.generateSafe(req.user.id, dto);
  }

  @Post("cap-table")
  @ApiOperation({ summary: "Build and validate cap table" })
  capTable(
    @Req() req: AuthRequest,
    @Body()
    body: {
      founders: Array<{ name: string; sharesPercent: number }>;
      investors?: Array<{ name: string; amount: number; equity: number }>;
      optionPool?: number;
    },
  ) {
    return this.svc.generateCapTable(req.user.id, body);
  }

  @Post("data-room")
  @ApiOperation({ summary: "Set up investor data room" })
  setupDataRoom(@Req() req: AuthRequest, @Body() dto: DataRoomDto) {
    return this.svc.setupDataRoom(req.user.id, dto);
  }

  @Get("vc-tracker")
  @ApiOperation({ summary: "Active Nigerian VCs + grant opportunities" })
  getVCTracker() {
    return this.svc.getVCTracker();
  }

  @Post("investor-update")
  @ApiOperation({
    summary: "Generate investor update email + WhatsApp summary",
  })
  generateUpdate(
    @Req() req: AuthRequest,
    @Body()
    body: {
      companyName: string;
      period: string;
      metrics: Record<string, unknown>;
      highlights: string[];
      challenges: string[];
      ask?: string;
    },
  ) {
    return this.svc.generateInvestorUpdate(req.user.id, body);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MARKETING AUTOMATION
// ═════════════════════════════════════════════════════════════════════════════
@ApiTags("PlanAI / Marketing Automation")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/marketing")
export class MarketingAutoController {
  constructor(private readonly svc: MarketingAutoService) {}

  @Post("campaigns")
  @ApiOperation({ summary: "Create and queue email / WhatsApp / SMS campaign" })
  createCampaign(@Req() req: AuthRequest, @Body() dto: CreateCampaignDto) {
    return this.svc.createCampaign(req.user.id, dto);
  }

  @Get("campaigns")
  @ApiOperation({ summary: "List campaigns" })
  getCampaigns(@Req() req: AuthRequest) {
    return this.svc.getCampaigns(req.user.id);
  }

  @Post("drip")
  @ApiOperation({ summary: "Create triggered drip sequence" })
  createDrip(@Req() req: AuthRequest, @Body() dto: CreateDripSequenceDto) {
    return this.svc.createDripSequence(req.user.id, dto);
  }

  @Post("abandoned-cart")
  @ApiOperation({ summary: "Trigger abandoned cart WhatsApp recovery message" })
  abandonedCart(
    @Req() req: AuthRequest,
    @Body()
    body: {
      customerPhone: string;
      customerName: string;
      cartItems: Array<{ name: string; priceNGN: number }>;
      storeSlug: string;
      phoneNumberId: string;
    },
  ) {
    return this.svc.triggerAbandonedCartRecovery(req.user.id, body);
  }

  @Get("segments")
  @ApiOperation({ summary: "Customer segments for targeting" })
  getSegments(@Req() req: AuthRequest) {
    return this.svc.getCustomerSegments(req.user.id);
  }

  @Get("festive-templates")
  @ApiOperation({ summary: "Nigerian festive campaign templates" })
  getFestiveTemplates() {
    return this.svc.getFestiveTemplates();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// BUSINESS DISCOVERY
// ═════════════════════════════════════════════════════════════════════════════
@ApiTags("PlanAI / Business Discovery")
@ApiBearerAuth("access-token")
@UseGuards(JwtAuthGuard)
@Controller("planai/directory")
export class BizDirectoryController {
  constructor(private readonly svc: BizDirectoryService) {}

  @Get("search")
  @ApiOperation({
    summary: "Search Nigerian businesses by keyword / state / industry",
  })
  search(@Req() req: AuthRequest, @Query() dto: SearchBusinessesDto) {
    return this.svc.search(req.user.id, dto);
  }

  @Post("contacts")
  @ApiOperation({
    summary: "Find decision-maker emails for a company via Hunter.io",
  })
  findContacts(@Req() req: AuthRequest, @Body() dto: FindContactsDto) {
    return this.svc.findContacts(req.user.id, dto);
  }

  @Post("verify-email")
  @ApiOperation({ summary: "Verify a single email address" })
  verifyEmail(@Req() req: AuthRequest, @Body() body: { email: string }) {
    return this.svc.verifyEmail(req.user.id, body.email);
  }

  @Get("intent-signals")
  @ApiOperation({
    summary: "Nigerian B2B intent signals — funded, hiring, new registrations",
  })
  getIntentSignals(
    @Req() req: AuthRequest,
    @Query("industry") industry?: string,
  ) {
    return this.svc.getIntentSignals(req.user.id, industry);
  }

  @Get("recent-searches")
  @ApiOperation({ summary: "Recent search history" })
  getRecentSearches(@Req() req: AuthRequest) {
    return this.svc.getRecentSearches(req.user.id);
  }
}
