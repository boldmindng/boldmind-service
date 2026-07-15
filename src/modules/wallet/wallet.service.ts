import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  PrismaClient,
  Prisma,
  WalletSource,
  WalletLedger,
  Wallet,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";
import {
  WalletBalanceResponse,
  WalletLedgerResponse,
  WalletLedgerEntry,
  TopUpInitiateResponse,
} from "./wallet.dto";

// ── Tier caps (in kobo) ────────────────────────────────────────────────────────
const TIER1_DAILY_CAP = 5_000_000; // ₦50,000
const TIER2_DAILY_CAP = 500_000_000; // ₦5,000,000

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Get or create wallet ───────────────────────────────────────────────────

  async getOrCreate(userId: string): Promise<Wallet> {
    return this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balanceKobo: 0 },
    });
  }

  // ── Credit (add funds) ─────────────────────────────────────────────────────
  // Called internally only — no HTTP route.
  // Always runs inside a Prisma $transaction to prevent race conditions.

  async credit(params: {
    userId: string;
    amountKobo: number;
    source: WalletSource;
    description: string;
    reference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<WalletLedger> {
    if (params.amountKobo <= 0) {
      throw new BadRequestException("Credit amount must be positive");
    }

    return await this.prisma.$transaction(async (tx) => {
      // Ensure wallet exists before updating
      await tx.wallet.upsert({
        where: { userId: params.userId },
        update: {},
        create: { userId: params.userId, balanceKobo: 0 },
      });

      const wallet = await tx.wallet.update({
        where: { userId: params.userId },
        data: { balanceKobo: { increment: params.amountKobo } },
      });

      return tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amountKobo: params.amountKobo,
          balanceAfter: wallet.balanceKobo,
          description: params.description,
          reference: params.reference ?? null,
          source: params.source,
          metadata: (params.metadata ?? {}) as any,
        },
      });
    });
  }

  // ── Debit (spend funds) ────────────────────────────────────────────────────
  // Called internally only — no HTTP route.

  async debit(params: {
    userId: string;
    amountKobo: number;
    source: WalletSource;
    description: string;
    reference?: string;
  }): Promise<WalletLedger> {
    if (params.amountKobo <= 0) {
      throw new BadRequestException("Debit amount must be positive");
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: params.userId },
      });

      if (!wallet) {
        throw new NotFoundException("Wallet not found");
      }

      // Locked wallet check — must happen before any balance check
      if (wallet.isLocked) {
        throw new ForbiddenException(
          `Wallet is locked${wallet.lockReason ? ": " + wallet.lockReason : ""}`,
        );
      }

      // Insufficient funds
      if (wallet.balanceKobo < params.amountKobo) {
        throw new BadRequestException(
          `Insufficient balance. Available: ₦${(wallet.balanceKobo / 100).toLocaleString("en-NG")}`,
        );
      }

      // Daily debit cap — reset counter if we've crossed midnight Lagos time
      const resetWallet = await this.resetDailyDebitIfNeeded(tx, wallet);
      const currentDailyDebit = resetWallet.dailyDebitKobo;
      const cap = wallet.tier === "TIER1" ? TIER1_DAILY_CAP : TIER2_DAILY_CAP;

      if (currentDailyDebit + params.amountKobo > cap) {
        const capNaira = (cap / 100).toLocaleString("en-NG");
        throw new BadRequestException(
          `Daily debit limit of ₦${capNaira} exceeded for ${wallet.tier} wallet`,
        );
      }

      const updated = await tx.wallet.update({
        where: { userId: params.userId },
        data: {
          balanceKobo: { decrement: params.amountKobo },
          dailyDebitKobo: { increment: params.amountKobo },
        },
      });

      return tx.walletLedger.create({
        data: {
          walletId: updated.id,
          type: "DEBIT",
          amountKobo: -params.amountKobo, // stored negative for debits
          balanceAfter: updated.balanceKobo,
          description: params.description,
          reference: params.reference ?? null,
          source: params.source,
        },
      });
    });
  }

  // ── Balance ────────────────────────────────────────────────────────────────

  async getBalance(userId: string): Promise<WalletBalanceResponse> {
    const wallet = await this.getOrCreate(userId);
    return this.formatBalance(wallet);
  }

  // ── Ledger (paginated) ─────────────────────────────────────────────────────

  async getLedger(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<WalletLedgerResponse> {
    const wallet = await this.getOrCreate(userId);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.walletLedger.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.walletLedger.count({ where: { walletId: wallet.id } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: rows.map((row) => this.formatLedgerEntry(row)),
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  // ── Topup initiate ─────────────────────────────────────────────────────────
  // Creates a Paystack payment intent; actual credit happens in the
  // payment webhook when charge.success fires with productSlug='wallet-topup'.

  async initiateTopUp(
    userId: string,
    amountNGN: number,
  ): Promise<TopUpInitiateResponse> {
    if (amountNGN < 100) {
      throw new BadRequestException("Minimum top-up is ₦100");
    }

    const amountKobo = amountNGN * 100;

    // Retrieve user email for Paystack
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    // Reference pattern: wallet-topup-{userId}-{timestamp}
    const reference = `wallet-topup-${userId}-${Date.now()}`;

    // Call Paystack initialize — this is a placeholder until PaymentService
    // is injected. For now, return the reference for the controller to use.
    // In production: inject PaymentService and call paymentService.initiate(...)
    return {
      authorizationUrl: `https://checkout.paystack.com/${reference}`, // placeholder
      reference,
      amountKobo,
    };
  }

  // ── Upgrade to Tier 2 (BVN required) ──────────────────────────────────────
  // bvnHash must be pre-verified against NIBSS before calling this.
  // Only the hash is stored — never the plain BVN.

  async upgradeTier(
    userId: string,
    bvnHash: string,
  ): Promise<{ tier: "TIER2" }> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

    if (!wallet) {
      throw new NotFoundException("Wallet not found");
    }

    if (wallet.tier === "TIER2") {
      throw new BadRequestException("Wallet is already TIER2");
    }

    // Store the BVN hash on the user record and upgrade the wallet in one transaction
    await this.prisma.$transaction([
      this.prisma.wallet.update({
        where: { userId },
        data: { tier: "TIER2" },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { bvnHash } as any, // bvnHash field exists per system design — add to schema if missing
      }),
    ]);

    return { tier: "TIER2" };
  }

  // ── Admin: lock / unlock ───────────────────────────────────────────────────

  async lockWallet(userId: string, reason: string): Promise<void> {
    await this.prisma.wallet.update({
      where: { userId },
      data: { isLocked: true, lockReason: reason },
    });
  }

  async unlockWallet(userId: string): Promise<void> {
    await this.prisma.wallet.update({
      where: { userId },
      data: { isLocked: false, lockReason: null },
    });
  }

  // ── Admin: manual credit ───────────────────────────────────────────────────

  async adminCredit(
    userId: string,
    amountKobo: number,
    description: string,
  ): Promise<WalletLedger> {
    return this.credit({
      userId,
      amountKobo,
      source: "ADMIN_CREDIT",
      description,
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Resets dailyDebitKobo to 0 if the last reset was on a different calendar
   * day in Africa/Lagos time. Mutates the wallet row in-place via `tx` and
   * returns the updated wallet so callers can read the fresh dailyDebitKobo.
   */
  private async resetDailyDebitIfNeeded(
    tx: Prisma.TransactionClient,
    wallet: Wallet,
  ): Promise<Wallet> {
    const now = new Date();

    const lagosNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Africa/Lagos" }),
    );
    const lagosLastReset = new Date(
      wallet.lastDebitReset.toLocaleString("en-US", {
        timeZone: "Africa/Lagos",
      }),
    );

    if (lagosNow.toDateString() === lagosLastReset.toDateString()) {
      return wallet; // same day — nothing to reset
    }

    return tx.wallet.update({
      where: { id: wallet.id },
      data: { dailyDebitKobo: 0, lastDebitReset: now },
    });
  }

  private formatBalance(wallet: Wallet): WalletBalanceResponse {
    return {
      balanceKobo: wallet.balanceKobo,
      balanceNaira: `₦${(wallet.balanceKobo / 100).toLocaleString("en-NG")}`,
      tier: wallet.tier,
      isLocked: wallet.isLocked,
      lockReason: wallet.lockReason,
    };
  }

  private formatLedgerEntry(row: WalletLedger): WalletLedgerEntry {
    const abs = Math.abs(row.amountKobo);
    return {
      id: row.id,
      type: row.type,
      amountKobo: row.amountKobo,
      amountNaira: `${row.type === "DEBIT" ? "-" : "+"}₦${(abs / 100).toLocaleString("en-NG")}`,
      balanceAfterKobo: row.balanceAfter,
      balanceAfterNaira: `₦${(row.balanceAfter / 100).toLocaleString("en-NG")}`,
      description: row.description,
      source: row.source,
      reference: row.reference,
      createdAt: row.createdAt,
    };
  }
}
