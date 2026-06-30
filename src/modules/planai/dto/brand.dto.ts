import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsUrl, IsIn, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_STATES } from '../planai.types';
import { PartialType } from '@nestjs/mapped-types';
import { StoreStatus } from '@prisma/client';

export class GenerateLogoDto {
  @ApiProperty({ description: 'Business name' })
  @IsString() @IsNotEmpty()
  businessName: string;

  @ApiProperty({ description: 'Business type/industry' })
  @IsString() @IsNotEmpty()
  industry: string;

  @ApiPropertyOptional({ description: 'Style keywords e.g. modern, bold, minimal' })
  @IsOptional() @IsString()
  styleKeywords?: string;

  @ApiPropertyOptional({ description: 'Primary colour preference (hex)' })
  @IsOptional() @IsString()
  preferredColor?: string;

  @ApiPropertyOptional({ description: 'Include Ankara/Adire motif' })
  @IsOptional() @IsBoolean()
  nigerianMotif?: boolean = false;

  @ApiPropertyOptional({ description: 'Number of variations', default: 3 })
  @IsOptional() @IsNumber() @Min(1) @Max(5)
  variations?: number = 3;
}

export class GenerateBrandKitDto {}

export class GenerateFlyerDto {}

export class GenerateColorPaletteDto {
  @IsString() industry: string;
  @IsString() targetAudience: string;
  @IsOptional() @IsString() mood?: string;
}

export class GeneratePortfolioDto {
  @ApiProperty({ description: 'Full name' })
  @IsString() @IsNotEmpty()
  fullName: string;

  @ApiProperty({ description: 'Professional title' })
  @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Bio / summary' })
  @IsString() @IsNotEmpty()
  bio: string;

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Portfolio template slug' })
  @IsOptional() @IsString()
  template?: string;

  @ApiPropertyOptional({ description: 'Custom subdomain e.g. yourname' })
  @IsOptional() @IsString()
  subdomain?: string;
}

// Store & Product
export class CreateStoreDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  slug?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ description: 'Business category' })
  @IsString() @IsNotEmpty()
  category: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  whatsappNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'Hex theme colour' })
  @IsOptional() @IsString()
  colorTheme?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  instagramShopSync?: boolean = false;

  @IsOptional()
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  logoUrl?: string;

  @IsOptional()
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Paystack subaccount code for payments' })
  @IsOptional() @IsString()
  paystackSubAccount?: string;

  @ApiPropertyOptional({ description: 'Physical address for local delivery' })
  @IsOptional() @IsString()
  address?: string;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {
  @IsOptional() @IsIn(['ACTIVE', 'PAUSED', 'SUSPENDED'])
  status?: StoreStatus;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}