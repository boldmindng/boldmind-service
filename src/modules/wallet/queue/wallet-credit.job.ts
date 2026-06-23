import { WalletSource } from '@prisma/client';

/**
 * Payload for the WALLET_CREDIT queue.
 * Producer: WalletService.queueCredit()
 * Consumer: WalletCreditProcessor.process()
 */
export interface WalletCreditJobPayload {
  userId: string;
  amountKobo: number;
  source: WalletSource;
  description: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}
