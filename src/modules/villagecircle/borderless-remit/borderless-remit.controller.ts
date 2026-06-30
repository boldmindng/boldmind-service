import {
  Controller, Get, Post, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { BorderlessRemitService } from './borderless-remit.service';

@ApiTags('VillageCircle / BorderlessRemit')
@Controller('villagecircle/borderless-remit')
export class BorderlessRemitController {
  constructor(private readonly service: BorderlessRemitService) {}

  @Get('currencies')
  @ApiOperation({ summary: 'Get supported currencies and banks (public)' })
  currencies() {
    return this.service.getSupportedCurrencies();
  }

  @Get('quote')
  @ApiOperation({ summary: 'Get a live FX quote (public)' })
  quote(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: number,
  ) {
    return this.service.getQuote(from, to, Number(amount));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a new transfer' })
  initiate(@CurrentUser('id') userId: string, @Body() dto: {
    sendAmount: number;
    sendCurrency: string;
    receiveCurrency: string;
    sender: { name: string; country: string };
    recipient: { name: string; phone: string; bank: string; accountNumber: string; accountName: string };
  }) {
    return this.service.initiateTransfer(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('transfers')
  @ApiOperation({ summary: 'Get my transfer history' })
  myTransfers(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getMyTransfers(userId, { status, page, limit });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('transfers/:trackingId')
  @ApiOperation({ summary: 'Track a transfer by ID' })
  track(@CurrentUser('id') userId: string, @Param('trackingId') trackingId: string) {
    return this.service.getTransferByTracking(userId, trackingId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Delete('transfers/:trackingId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending transfer' })
  cancel(@CurrentUser('id') userId: string, @Param('trackingId') trackingId: string) {
    return this.service.cancelTransfer(userId, trackingId);
  }

  // ── Admin / provider webhook ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Post('transfers/:trackingId/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Update transfer status (processing → completed / failed)' })
  updateStatus(
    @Param('trackingId') trackingId: string,
    @Body() dto: { status: 'processing' | 'completed' | 'failed'; message?: string },
  ) {
    return this.service.updateTransferStatus(trackingId, dto.status, dto.message);
  }
}
