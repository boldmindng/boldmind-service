import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { WalletService } from './wallet.service';
import { UpgradeTierDto, TopUpInitiateDto } from './wallet.dto';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ── GET /wallet ────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Get wallet balance and tier info' })
  @ApiResponse({
    status: 200,
    description: 'Returns balance in kobo, formatted Naira string, tier, and lock status',
    schema: {
      example: {
        balanceKobo: 1250000,
        balanceNaira: '₦12,500',
        tier: 'TIER1',
        isLocked: false,
        lockReason: null,
      },
    },
  })
  getBalance(@CurrentUser() user: JwtPayload) {
    return this.walletService.getBalance(user.sub);
  }

  // ── GET /wallet/ledger ─────────────────────────────────────────────────────

  @Get('ledger')
  @ApiOperation({ summary: 'Paginated transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of wallet ledger entries, newest first',
    schema: {
      example: {
        data: [
          {
            id: 'clx...',
            type: 'CREDIT',
            amountKobo: 500000,
            amountNaira: '+₦5,000',
            balanceAfterKobo: 1250000,
            balanceAfterNaira: '₦12,500',
            description: 'Referral commission — user signed up via your link',
            source: 'REFERRAL_COMMISSION',
            reference: null,
            createdAt: '2026-06-14T10:00:00.000Z',
          },
        ],
        total: 42,
        page: 1,
        pageSize: 20,
        totalPages: 3,
        hasNext: true,
        hasPrev: false,
      },
    },
  })
  getLedger(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.walletService.getLedger(user.sub, page, Math.min(pageSize, 50));
  }

  // ── POST /wallet/topup/initiate ────────────────────────────────────────────

  @Post('topup/initiate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Initiate a wallet top-up via Paystack',
    description:
      'Returns a Paystack authorization URL. The actual wallet credit happens in the ' +
      'payment webhook when charge.success fires with productSlug="wallet-topup".',
  })
  @ApiResponse({
    status: 200,
    description: 'Paystack checkout URL and reference',
    schema: {
      example: {
        authorizationUrl: 'https://checkout.paystack.com/...',
        reference: 'wallet-topup-clx...-1718357000000',
        amountKobo: 500000,
      },
    },
  })
  initiateTopUp(@CurrentUser() user: JwtPayload, @Body() dto: TopUpInitiateDto) {
    return this.walletService.initiateTopUp(user.sub, dto.amountNGN);
  }

  // ── POST /wallet/upgrade ───────────────────────────────────────────────────

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade wallet to TIER2 using a pre-verified BVN hash',
    description:
      'The BVN must be verified against NIBSS before calling this endpoint. ' +
      'Only the SHA-256 hash of the BVN is stored — never the plain BVN. ' +
      'TIER2 raises the daily debit cap from ₦50,000 to ₦5,000,000.',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet tier upgraded successfully',
    schema: { example: { tier: 'TIER2' } },
  })
  @ApiResponse({ status: 400, description: 'Already TIER2 or wallet not found' })
  upgradeTier(@CurrentUser() user: JwtPayload, @Body() dto: UpgradeTierDto) {
    return this.walletService.upgradeTier(user.sub, dto.bvnHash);
  }
}