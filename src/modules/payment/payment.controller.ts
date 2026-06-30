import {
  Controller, Post, Get, Body, Param, Query, Req, Headers, RawBodyRequest,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { InitializePaymentDto, VerifyPaymentDto } from './payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { Public } from '../../common/decorators/public.decorator';


@ApiTags('Payments')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post('initialize')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initialize Paystack payment' })
  initialize(
    @CurrentUser('id') userId: string,
    @CurrentUser('email') email: string,
    @Body() dto: InitializePaymentDto,
  ) {
    return this.paymentService.initializePayment(userId, email, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('verify/:reference')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Verify a Paystack transaction' })
  verify(@Param('reference') reference: string) {
    return this.paymentService.verifyPayment(reference);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack webhook endpoint' })
  webhook(
    @Headers('x-paystack-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleWebhook(signature, req.rawBody);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get payment history for current user' })
  history(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.paymentService.getUserPayments(userId, +page, +limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all subscriptions for current user' })
  subscriptions(@CurrentUser('id') userId: string) {
    return this.paymentService.getUserSubscriptions(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('access/:productSlug')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Check if user has access to a product' })
  checkAccess(
    @CurrentUser('id') userId: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.paymentService.checkProductAccess(userId, productSlug);
  }

  @Public()
  @Post('waitlist')
  @ApiOperation({ summary: 'Join product waitlist' })
  joinWaitlist(@Body() body: { productSlug: string; email: string; name?: string }) {
    return this.paymentService.createWaitlistEntry(body.productSlug, body.email, body.name);
  }
}