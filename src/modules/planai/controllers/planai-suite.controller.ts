import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlanAISuiteService } from '../services/planai-suite.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';

@ApiTags('PlanAI')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('planai')
export class PlanAISuiteController {
  constructor(private readonly planaiService: PlanAISuiteService) {}

  // ── Job management ────────────────────────────────────────
  @Get('jobs')
  @ApiOperation({ summary: 'Get all PlanAI jobs for current user' })
  getJobs(
    @CurrentUser('id') userId: string,
    @Query('tool') tool?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.planaiService.getUserJobs(userId, tool, +page, +limit);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get a specific PlanAI job result' })
  getJob(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.planaiService.getJob(id, userId);
  }

  // ── Tool 1: Business Planning ─────────────────────────────
  @Post('planning')
  @ApiOperation({ summary: 'Generate a bank-ready Nigerian business plan' })
  businessPlan(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateBusinessPlan(userId, body);
  }

  // ── Tool 2: Financial Forecasting ─────────────────────────
  @Post('finance')
  @ApiOperation({ summary: 'Generate 12-month financial forecast' })
  financeForecast(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateFinancialForecast(userId, body);
  }

  // ── Tool 3: Branding ──────────────────────────────────────
  @Post('branding')
  @ApiOperation({ summary: 'Generate brand kit + optional AI logo' })
  brandKit(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateBrandKit(userId, body);
  }

  // ── Tool 4: Marketing ─────────────────────────────────────
  @Post('marketing')
  @ApiOperation({ summary: 'Generate marketing copy for any platform' })
  marketingCopy(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateMarketingCopy(userId, body);
  }

  // ── Tool 5: Credibility Hubs ──────────────────────────────
  @Post('credibility')
  @ApiOperation({ summary: 'Generate LinkedIn profile, resume, portfolio content' })
  credibility(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateCredibilityContent(userId, body);
  }

  // ── Tool 6: Investor Readiness ────────────────────────────
  @Post('investor')
  @ApiOperation({ summary: 'Generate investor docs, pitch deck content, SAFE' })
  investor(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateInvestorDocs(userId, body);
  }

  // ── Tool 7: HR Tools ──────────────────────────────────────
  @Post('hr')
  @ApiOperation({ summary: 'Generate HR documents for Nigerian businesses' })
  hr(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateHRContent(userId, body);
  }

  // ── Tool 8: Legal Templates ───────────────────────────────
  @Post('legal')
  @ApiOperation({ summary: 'Generate Nigerian-law legal templates' })
  legal(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateLegalTemplate(userId, body);
  }

  // ── Tool 9: Storefront ────────────────────────────────────
  @Post('store/content')
  @ApiOperation({ summary: 'Generate product descriptions and store copy' })
  storeContent(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateStorefrontContent(userId, body);
  }

  // ── Tool 10: Analytics Insights ───────────────────────────
  @Post('analytics/insights')
  @ApiOperation({ summary: 'Generate AI insights from your analytics metrics' })
  analyticsInsights(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateAnalyticsInsights(userId, body);
  }

  // ── Tool 11: Operations ───────────────────────────────────
  @Post('operations')
  @ApiOperation({ summary: 'Generate SOPs, KPI frameworks, org charts' })
  operations(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.planaiService.generateOperationsDoc(userId, body);
  }

  // ── Tool 12: Email enrichment ─────────────────────────────
  @Post('emailscraper/enrich')
  @ApiOperation({ summary: 'AI-enrich scraped email leads' })
  enrichLeads(@CurrentUser('id') userId: string, @Body() body: { leads: any[] }) {
    return this.planaiService.enrichLeadData(userId, body.leads);
  }
}