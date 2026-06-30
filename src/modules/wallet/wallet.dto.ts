import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  Min,
  MaxLength,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WalletSource, WalletTier } from '@prisma/client';

// ─── REQUEST DTOs ─────────────────────────────────────────────────────────────

export class UpgradeTierDto {
  @ApiProperty({
    description: 'SHA-256 hash of the BVN — verified upstream via NIBSS. Never the plain BVN.',
    example: 'e3b0c44298fc1c149afb...', // truncated
  })
  @IsString()
  @IsNotEmpty()
  bvnHash: string;
}

export class TopUpInitiateDto {
  @ApiProperty({
    description: 'Amount to top up in Naira (not kobo). Minimum ₦100.',
    example: 5000,
    minimum: 100,
  })
  @IsInt()
  @Min(10000) // 100 NGN in kobo
  amountNGN: number;
}

// ─── INTERNAL-USE DTOs (not HTTP endpoints — called from other services) ──────

export class WalletCreditDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @IsPositive()
  amountKobo: number;

  @IsEnum(WalletSource)
  source: WalletSource;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class WalletDebitDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsInt()
  @IsPositive()
  amountKobo: number;

  @IsEnum(WalletSource)
  source: WalletSource;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @IsString()
  @IsOptional()
  reference?: string;
}

// ─── RESPONSE SHAPES (plain objects, not class-transformer) ──────────────────

export interface WalletBalanceResponse {
  balanceKobo: number;
  balanceNaira: string; // e.g. "₦12,500"
  tier: WalletTier;
  isLocked: boolean;
  lockReason?: string | null;
}

export interface WalletLedgerResponse {
  data: WalletLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface WalletLedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  amountKobo: number;
  amountNaira: string;
  balanceAfterKobo: number;
  balanceAfterNaira: string;
  description: string;
  source: WalletSource;
  reference?: string | null;
  createdAt: Date;
}

export interface TopUpInitiateResponse {
  authorizationUrl: string;
  reference: string;
  amountKobo: number;
}