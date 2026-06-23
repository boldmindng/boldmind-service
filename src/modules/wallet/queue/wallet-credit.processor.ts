import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUES } from '../../../common/constants/queues';
import { WalletService } from '../wallet.service';
import { WalletCreditJobPayload } from './wallet-credit.job';

/**
 * Consumes jobs from QUEUES.WALLET_CREDIT.
 *
 * @Processor binds this class to the queue registered in wallet.module.ts
 * via BullModule.registerQueue({ name: QUEUES.WALLET_CREDIT }), which in
 * turn runs on the shared redis.queue connection from app.module.ts.
 *
 * Concurrency is deliberately low (3) — wallet writes are transactional
 * and per-user; there's no benefit to high parallelism here, and it
 * reduces contention on the same userId's row under load.
 */
@Processor(QUEUES.WALLET_CREDIT, { concurrency: 3 })
export class WalletCreditProcessor extends WorkerHost {
  private readonly logger = new Logger(WalletCreditProcessor.name);

  constructor(private readonly walletService: WalletService) {
    super();
  }

  async process(job: Job<WalletCreditJobPayload>): Promise<{ ledgerId: string }> {
    this.logger.log(`Processing wallet credit job=${job.id} userId=${job.data.userId}`);

    const ledgerEntry = await this.walletService.credit(job.data);

    return { ledgerId: ledgerEntry.id };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<WalletCreditJobPayload>) {
    this.logger.log(`✅ wallet-credit job=${job.id} completed for userId=${job.data.userId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WalletCreditJobPayload> | undefined, error: Error) {
    this.logger.error(
      `❌ wallet-credit job=${job?.id} FAILED for userId=${job?.data?.userId}: ${error.message}`,
    );
  }
}
