import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { MarketingAutoService } from '../services/marketing-auto.service';
import { CreateCampaignDto, CreateWhatsAppBroadcastDto } from '../dto/all-planai.dto';

interface JwtPayload { sub: string; id: string; }

@Controller('planai/marketing')
@UseGuards(JwtAuthGuard)
export class MarketingAutoController {
  constructor(private readonly marketingService: MarketingAutoService) {}

  // POST /planai/marketing/campaigns
  @Post('campaigns')
  createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketingService.createCampaign(user.sub, dto);
  }

  // POST /planai/marketing/campaigns/:id/send
  @Post('campaigns/:id/send')
  sendCampaign(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketingService.sendCampaign(id, user.sub);
  }

  // POST /planai/marketing/generate/subject-lines
  @Post('generate/subject-lines')
  generateSubjectLines(
    @Body() dto: { topic: string; brand: string; tone?: string },
  ) {
    return this.marketingService.generateSubjectLines(dto);
  }

  // POST /planai/marketing/generate/email-copy
  @Post('generate/email-copy')
  generateEmailCopy(
    @Body() dto: { topic: string; cta: string; audience: string; tone?: string },
  ) {
    return this.marketingService.generateEmailCopy(dto);
  }

  // POST /planai/marketing/whatsapp/broadcast
  @Post('whatsapp/broadcast')
  createWhatsAppBroadcast(
    @Body() dto: CreateWhatsAppBroadcastDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketingService.createWhatsAppBroadcast(user.sub, dto);
  }

  // GET /planai/marketing/campaigns/:id/stats
  @Get('campaigns/:id/stats')
  getCampaignAnalytics(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.marketingService.getCampaignAnalytics(id, user.sub);
  }
}