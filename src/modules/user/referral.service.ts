import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../database/redis.service";

/**
 * Built against the real schema.prisma:
 *
 * - UserProfile.referralCode: String @unique @default(cuid()) — every
 *   profile already gets a code for free. We override it with a shorter
 *   hex code on creation for nicer shareable links (matches the original
 *   completeOnboarding behavior).
 * - UserProfile.referredBy: String? — stores the referral CODE the user
 *   signed up with. This is attribution only, not a Referral row.
 * - Referral: { referrerId, referredId (unique), productSlug (required),
 *   status: 'pending' | 'converted' | 'paid', commissionKobo }. Because
 *   referredId is globally unique, a user can only ever be attached to
 *   ONE Referral row — the first product they convert on.
 * - Wallet / WalletLedger: commission payouts are credited here, using
 *   WalletSource.REFERRAL_COMMISSION.
 */

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);
  private static readonly CODE_BYTES = 4; // -> 8 hex chars

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(ReferralService.CODE_BYTES).toString("hex");
      const existing = await this.prisma.userProfile.findUnique({
        where: { referralCode: code },
        select: { userId: true },
      });
      if (!existing) return code;
    }
    throw new Error(
      "Failed to generate a unique referral code after 5 attempts",
    );
  }

  /**
   * Returns the user's referral code, generating one on the profile if
   * it doesn't have one yet (e.g. called from UserService.completeOnboarding).
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { referralCode: true },
    });
    if (profile?.referralCode) return profile.referralCode;

    const code = await this.generateUniqueCode();
    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { referralCode: code },
      create: { userId, referralCode: code },
    });
    return code;
  }

  /**
   * Attribution step — call when a new user signs up with someone else's
   * referral code. Only tags UserProfile.referredBy; does NOT create a
   * commission-earning Referral row (that happens on conversion, since
   * Referral is scoped to a specific paid product).
   */
  async recordAttribution(userId: string, code: string) {
    if (!code?.trim()) {
      throw new BadRequestException("Referral code is required");
    }

    const referrer = await this.prisma.userProfile.findUnique({
      where: { referralCode: code },
      select: { userId: true },
    });
    if (!referrer) throw new NotFoundException("Invalid referral code");
    if (referrer.userId === userId) {
      throw new BadRequestException("You cannot refer yourself");
    }

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { referredBy: true },
    });
    if (existing?.referredBy) {
      throw new BadRequestException("You have already used a referral code");
    }

    await this.prisma.userProfile.upsert({
      where: { userId },
      update: { referredBy: code },
      create: { userId, referredBy: code },
    });

    return { referredBy: code };
  }

  /**
   * Conversion step — call this from wherever a payment/subscription
   * actually completes for a referred user (e.g. a Paystack/Flutterwave
   * webhook handler), not from the users module. Resolves the referrer
   * via UserProfile.referredBy and writes the Referral row. Because
   * referredId is unique on the schema, only the FIRST product a user
   * converts on ever earns a referral row — subsequent calls are no-ops.
   */
  async recordConversion(
    referredUserId: string,
    productSlug: string,
    commissionKobo = 0,
  ) {
    const referredProfile = await this.prisma.userProfile.findUnique({
      where: { userId: referredUserId },
      select: { referredBy: true },
    });
    if (!referredProfile?.referredBy) return null; // not a referred signup

    const referrerProfile = await this.prisma.userProfile.findUnique({
      where: { referralCode: referredProfile.referredBy },
      select: { userId: true },
    });
    if (!referrerProfile) return null; // code no longer resolves to anyone

    const existing = await this.prisma.referral.findUnique({
      where: { referredId: referredUserId },
    });
    if (existing) return existing; // already recorded, referredId is unique

    const referral = await this.prisma.referral.create({
      data: {
        referrerId: referrerProfile.userId,
        referredId: referredUserId,
        productSlug,
        status: commissionKobo > 0 ? "converted" : "pending",
        commissionKobo,
      },
    });

    await this.redis.del(`referral:stats:${referrerProfile.userId}`);
    this.logger.log(
      `Referral converted: ${referrerProfile.userId} <- ${referredUserId} (${productSlug})`,
    );
    return referral;
  }

  /**
   * Pays out an already-converted referral: credits the referrer's
   * wallet via WalletLedger and marks the referral 'paid'. Creates the
   * wallet if the referrer doesn't have one yet.
   */
  async payoutCommission(referralId: string) {
    const referral = await this.prisma.referral.findUnique({
      where: { id: referralId },
    });
    if (!referral) throw new NotFoundException("Referral not found");
    if (referral.status === "paid") return referral;
    if (referral.commissionKobo <= 0) {
      throw new BadRequestException("Referral has no commission to pay out");
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId: referral.referrerId },
        update: {},
        create: { userId: referral.referrerId },
      });

      const balanceAfter = wallet.balanceKobo + referral.commissionKobo;

      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "CREDIT",
          amountKobo: referral.commissionKobo,
          balanceAfter,
          description: `Referral commission — ${referral.productSlug}`,
          source: "REFERRAL_COMMISSION",
          reference: referral.id,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balanceKobo: balanceAfter },
      });

      const updated = await tx.referral.update({
        where: { id: referral.id },
        data: { status: "paid" },
      });

      await this.redis.del(`referral:stats:${referral.referrerId}`);
      return updated;
    });
  }

  async getStats(userId: string) {
    return this.redis.withCache(
      `referral:stats:${userId}`,
      async () => {
        const code = await this.getOrCreateCode(userId);
        const [totalReferrals, paidReferrals, earnings] = await Promise.all([
          this.prisma.referral.count({ where: { referrerId: userId } }),
          this.prisma.referral.count({
            where: { referrerId: userId, status: "paid" },
          }),
          this.prisma.referral.aggregate({
            where: { referrerId: userId, status: "paid" },
            _sum: { commissionKobo: true },
          }),
        ]);
        return {
          code,
          totalReferrals,
          paidReferrals,
          pendingReferrals: totalReferrals - paidReferrals,
          totalEarnedKobo: earnings._sum.commissionKobo ?? 0,
        };
      },
      300, // 5 min cache
    );
  }

  async getMyReferrals(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          referred: {
            select: { id: true, name: true, email: true, createdAt: true },
          },
        },
      }),
      this.prisma.referral.count({ where: { referrerId: userId } }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
