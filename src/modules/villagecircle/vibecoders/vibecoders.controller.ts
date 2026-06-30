import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus, Headers, RawBodyRequest, Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { VibeCodersService } from './vibecoders.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { VibeCoderStatus } from '@prisma/client';

@ApiTags('Vibe Coders')
@Controller('vibecoders')
export class VibeCodersController {
  constructor(private readonly service: VibeCodersService) {}

  // ── Public: Apply — Step 1 ─────────────────────────────────────────────────

  @Public()
  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a Vibe Coders interest application (Step 1)' })
  apply(@Body() dto: {
    name: string;
    email: string;
    whatsapp: string;
    archetype: string;
    idea: string;
    obstacle: string;
    commitment: string;
    source?: string;
    referralCode?: string;
  }) {
    return this.service.submitApplication(dto);
  }

  // ── Public: Assessment — Step 2 ────────────────────────────────────────────

  @Public()
  @Get('assessment')
  @ApiOperation({ summary: 'Validate an assessment token (check link is valid)' })
  validateToken(@Query('token') token: string) {
    return this.service.validateAssessmentToken(token);
  }

  @Public()
  @Post('assessment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit the Step 2 deep assessment (token-gated)' })
  submitAssessment(@Body() dto: { token: string; answers: Record<string, string | number> }) {
    return this.service.submitAssessment(dto.token, dto.answers);
  }

  // ── Public: Cohort info ────────────────────────────────────────────────────

  @Public()
  @Get('cohort')
  @ApiOperation({ summary: 'Get current cohort status and info' })
  cohortInfo() {
    return this.service.getCohortInfo();
  }

  // ── Auth: Payment ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('payment/initialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize Paystack payment for accepted applicant' })
  initPayment(
    @Body() dto: {
      applicantId: string;
      paymentPath: 'one_time' | 'installment' | 'isa' | 'scholarship';
      amount: number;
      callbackUrl?: string;
    },
  ) {
    return this.service.initializePayment(dto.applicantId, {
      paymentPath: dto.paymentPath,
      amount: dto.amount,
      callbackUrl: dto.callbackUrl,
    });
  }

  // ── Public: Paystack webhook ───────────────────────────────────────────────

  @Public()
  @Post('payment/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack payment webhook (internal)' })
  paymentWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body);
    return this.service.handlePaymentWebhook(rawBody, signature);
  }

  // ── Admin: Applicants ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'manager')
  @ApiBearerAuth('access-token')
  @Get('admin/applicants')
  @ApiOperation({ summary: '[Admin] List all applicants with filters' })
  listApplicants(
    @Query('status') status?: VibeCoderStatus,
    @Query('cohortId') cohortId?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getApplicants({ status, cohortId, search, page, limit });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'manager')
  @ApiBearerAuth('access-token')
  @Patch('admin/applicants/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Update applicant status (shortlist, accept, reject)' })
  updateApplicant(
    @Param('id') id: string,
    @Body() dto: { status: VibeCoderStatus; adminNotes?: string },
  ) {
    return this.service.updateApplicantStatus(id, dto.status, dto.adminNotes);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Post('admin/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Manually enroll an applicant (ISA / scholarship / override)' })
  enroll(@Body() dto: { applicantId: string; cohortId?: string }) {
    return this.service.enrollApplicant(dto.applicantId, dto.cohortId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'manager')
  @ApiBearerAuth('access-token')
  @Get('admin/stats')
  @ApiOperation({ summary: '[Admin] Get cohort and application stats' })
  adminStats() {
    return this.service.getAdminStats();
  }
}
