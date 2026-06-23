import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { SearchBusinessesDto, FindContactsDto } from '../dto/all-planai.dto';
import { BizDirectoryService } from '../services/biz-directory.service';
import type { JwtPayload } from '../../auth/auth.service';

@ApiTags('PlanAI — Business Discovery Directory')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('planai/directory')
export class BizDirectoryController {
  constructor(private readonly bizDirectory: BizDirectoryService) {}

  // ── Business search ────────────────────────────────────────────────────────

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Search Nigerian business directory' })
  search(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SearchBusinessesDto,
  ) {
    return this.bizDirectory.search(user.sub, dto);
  }

  // ── Contact discovery ──────────────────────────────────────────────────────

  @Post('contacts/find')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find contacts / emails for a company via Hunter.io' })
  findContacts(
    @CurrentUser() user: JwtPayload,
    @Body() dto: FindContactsDto,
  ) {
    return this.bizDirectory.findContacts(user.sub, dto);
  }

  // ── Email verification ─────────────────────────────────────────────────────

  @Post('contacts/verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a single email address' })
  verifyEmail(
    @CurrentUser() user: JwtPayload,
    @Body('email') email: string,
  ) {
    return this.bizDirectory.verifyEmail(user.sub, email);
  }

  @Post('contacts/bulk-verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-verify up to 50 email addresses' })
  bulkVerify(
    @CurrentUser() user: JwtPayload,
    @Body('emails') emails: string[],
  ) {
    return this.bizDirectory.bulkVerify(user.sub, emails);
  }

  // ── Intent signals ─────────────────────────────────────────────────────────

  @Get('intent')
  @ApiOperation({ summary: 'Get B2B intent signals (new CAC registrations, funding, hiring)' })
  getIntentSignals(
    @CurrentUser() user: JwtPayload,
    @Query('industry') industry?: string,
  ) {
    return this.bizDirectory.getIntentSignals(user.sub, industry);
  }

  // ── Lead lists ─────────────────────────────────────────────────────────────

  @Get('lists')
  @ApiOperation({ summary: 'Get all saved lead lists' })
  getLists(@CurrentUser() user: JwtPayload) {
    return this.bizDirectory.getUserLists(user.sub);
  }

  @Post('lists')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new lead list' })
  createList(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { name: string; description?: string },
  ) {
    return this.bizDirectory.createList(user.sub, dto.name, dto.description);
  }

  // ── Leads & export ─────────────────────────────────────────────────────────

  @Get('leads')
  @ApiOperation({ summary: 'Get recent contact lookups' })
  getLeads(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) _page: number,
    @Query('listId') _listId?: string,
  ) {
    return this.bizDirectory.getRecentSearches(user.sub);
  }

  @Get('leads/export')
  @ApiOperation({ summary: 'Export leads as CSV or JSON' })
  async exportLeads(
    @CurrentUser() user: JwtPayload,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Query('listId') listId: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.bizDirectory.exportLeads(user.sub, listId, format);
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  }

  // ── Scrape job history ─────────────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({ summary: 'Get recent email scrape job history' })
  getScrapeJobs(@CurrentUser() user: JwtPayload) {
    return this.bizDirectory.getUserJobs(user.sub);
  }
}