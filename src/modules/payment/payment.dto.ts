import { IsString, IsInt, IsOptional, Min, IsEnum, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializePaymentDto {
  @ApiProperty({ example: 'educenter', description: 'Product slug' })
  @IsString()
  productSlug: string;

  @ApiProperty({ example: 300000, description: 'Amount in kobo (₦3,000 = 300000 kobo)' })
  @IsInt()
  @Min(10000) // min ₦100
  amountNGN: number;

  @ApiProperty({ example: 'EduCenter Monthly Subscription' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ example: 'monthly' })
  @IsOptional()
  @IsString()
  interval?: string;

  @ApiPropertyOptional({ example: 'https://boldmind.ng/dashboard' })
  @IsOptional()
  @IsString()
  callbackUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class VerifyPaymentDto {
  @ApiProperty()
  @IsString()
  reference: string;
}

export class WebhookDto {
  @IsString()
  event: string;
  data: any;
}

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  productSlug: string;

  @ApiProperty()
  @IsString()
  planName: string;

  @ApiProperty()
  @IsInt()
  @Min(10000)
  amountNGN: number;

  @ApiProperty({ enum: ['monthly', 'quarterly', 'annually'] })
  @IsEnum(['monthly', 'quarterly', 'annually'])
  interval: string;
}