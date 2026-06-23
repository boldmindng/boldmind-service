import {
  IsString, IsOptional, IsNotEmpty, IsArray, IsBoolean, IsNumber, IsIn, Min, Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_STATES, NG_LANGUAGES, IndustryBundle, PlanAIToolSlug } from '../planai.types';

export class OnboardingDto {
  @ApiProperty({ description: 'Business name' })
  @IsString() @IsNotEmpty()
  businessName: string;

  @ApiProperty({ description: 'Business type / industry' })
  @IsString() @IsNotEmpty()
  businessType: string;

  @ApiPropertyOptional({ enum: ['restaurant', 'fashion', 'tech', 'beauty', 'retail', 'agency'] })
  @IsOptional()
  @IsIn(['restaurant', 'fashion', 'tech', 'beauty', 'retail', 'agency'])
  industryBundle?: IndustryBundle;

  @ApiPropertyOptional({ description: 'Nigerian state' })
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional()
  @IsIn(NG_LANGUAGES)
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedTools?: PlanAIToolSlug[];
}

export class PlanAIScoreQueryDto {
  @ApiPropertyOptional({ description: 'Recompute score even if cached' })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  refresh?: boolean;
}

export class MonthlyDigestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(1) @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber() @Min(2024)
  year?: number;
}