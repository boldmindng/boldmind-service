import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * WalletModule
 *
 * Registers the wallet endpoints and exports WalletService so other modules
 * (PaymentModule, UserModule, MarketplaceModule) can call credit() and debit()
 * without importing the whole module tree.
 *
 * Architecture note: Wallet stays inside boldmind-service (not a separate
 * service) so that wallet mutations can share Prisma $transactions with
 * subscription activation and referral conversion flows.
 *
 * Redis usage:
 *   - RedisService.session — rate-limiting on admin credit endpoint (future)
 *   - RedisService.cache   — wallet balance cache (future optimisation)
 *   Both are injected via DatabaseModule which is global.
 *
 * Endpoints registered:
 *   GET  /api/v1/wallet                    → balance + tier
 *   GET  /api/v1/wallet/ledger             → paginated transaction history
 *   POST /api/v1/wallet/topup/initiate     → Paystack checkout URL
 *   POST /api/v1/wallet/upgrade            → upgrade to TIER2 with BVN hash
 *
 * Internal-use methods (not HTTP routes):
 *   walletService.credit(...)  → called from payment webhook (topup), referral, admin
 *   walletService.debit(...)   → called from subscription payment, marketplace purchase
 *   walletService.lockWallet() → called from admin.service
 *   walletService.adminCredit()→ called from admin.service
 */
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService], // ← other modules import WalletModule to access WalletService
})
export class WalletModule {}