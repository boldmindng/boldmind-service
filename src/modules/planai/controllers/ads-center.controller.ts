import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdsCenterService } from '../services/ads-center.service';
import { CreateAdCampaignDto, GenerateAdCreativeDto } from '../dto/all-planai.dto';

interface AuthRequest extends Request { user: { id: string } }

@ApiTags('PlanAI / Ads Center')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('planai/ads')
export class AdsCenterController {
  constructor(private readonly svc: AdsCenterService) {}

  @Post('campaigns')
  @ApiOperation({ summary: 'Create a Meta / Google / TikTok ad campaign' })
  createCampaign(@Req() req: AuthRequest, @Body() dto: CreateAdCampaignDto) {
    return this.svc.createCampaign(req.user.id, dto);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'List all campaigns for current user' })
  getCampaigns(@Req() req: AuthRequest) {
    return this.svc.getMyCampaigns(req.user.id);
  }

  @Get('campaigns/:platformCampaignId/performance')
  @ApiOperation({ summary: 'Fetch live campaign performance from ad platform' })
  getPerformance(
    @Req() req: AuthRequest,
    @Param('platformCampaignId') platformCampaignId: string,
    @Query('platform') platform: string,
  ) {
    return this.svc.getCampaignPerformance(req.user.id, platformCampaignId, platform);
  }

  @Post('creative')
  @ApiOperation({ summary: 'Generate AI ad creative variants with image prompts' })
  generateCreative(@Req() req: AuthRequest, @Body() dto: GenerateAdCreativeDto) {
    return this.svc.generateAdCreative(req.user.id, dto);
  }

  @Post('compliance-check')
  @ApiOperation({ summary: 'Check ad copy against Meta / Google / TikTok policy' })
  checkCompliance(
    @Req() req: AuthRequest,
    @Body() body: { adCopy: string; platform: string },
  ) {
    return this.svc.checkAdCompliance(req.user.id, body.adCopy, body.platform);
  }
}