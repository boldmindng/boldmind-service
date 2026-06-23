import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser} from '../../common/decorators/user.decorator';
import {  Roles } from '../../common/decorators/roles.decorator';


@ApiTags('Automation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  // ── Social Content Factory ────────────────────────────────

  @Post('social/schedule')
  @ApiOperation({ summary: 'Schedule a social media post across platforms' })
  schedulePost(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.automationService.scheduleSocialPost(userId, {
      ...dto,
      scheduledAt: new Date(dto.scheduledAt),
    });
  }

  // @Post('social/calendar')
  // @ApiOperation({ summary: 'Generate an AI content calendar' })
  // generateCalendar(@CurrentUser('id') userId: string, @Body() dto: any) {
  //   return this.automationService.(userId, dto);
  // }

  @Post('social/captions')
  @ApiOperation({ summary: 'Bulk generate captions for posts' })
  bulkCaptions(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.automationService.bulkGenerateCaptions(userId, dto);
  }

  // ── Email Campaigns ───────────────────────────────────────

  @Post('email/campaign')
  @ApiOperation({ summary: 'Schedule an email broadcast campaign' })
  emailCampaign(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.automationService.scheduleEmailCampaign(userId, {
      ...dto,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    });
  }

  // ── Email Scraper ─────────────────────────────────────────

  @Post('scraper/run')
  @ApiOperation({ summary: 'Start an email scraping job' })
  scrapeEmails(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.automationService.scrapeEmails(userId, dto);
  }

  @Post('scraper/verify')
  @ApiOperation({ summary: 'Verify a single email address' })
  verifyEmail(@Body('email') email: string) {
    return this.automationService.verifyEmail(email);
  }

  // ── n8n trigger ───────────────────────────────────────────

  @Post('trigger')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Manually trigger an n8n workflow (admin)' })
  trigger(@Body() body: { workflow: string; payload?: any }) {
    return this.automationService.triggerN8NWorkflow(body.workflow, body.payload || {});
  }

  // ── Queue stats ───────────────────────────────────────────

  @Get('queues')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Get BullMQ queue statistics (admin)' })
  queueStats() {
    return this.automationService.getQueueStats();
  }
}
