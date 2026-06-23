import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject, IsArray, IsIn, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_LANGUAGES, NG_FESTIVE_CAMPAIGNS, NgFestiveCampaign } from '../planai.types';

export class CreateAdCampaignDto {
  @ApiProperty({ enum: ['meta', 'google', 'tiktok'] })
  @IsIn(['meta', 'google', 'tiktok'])
  platform: 'meta' | 'google' | 'tiktok';

  @ApiProperty()
  @IsString() @IsNotEmpty()
  campaignName: string;

  @ApiProperty({ description: 'Daily budget in Naira' })
  @IsNumber() @Min(1000)
  dailyBudgetNGN: number;

  @ApiProperty({ description: 'Campaign objective' })
  @IsIn(['awareness', 'traffic', 'leads', 'sales', 'engagement'])
  objective: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  targeting?: {
    states?: string[];
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    languages?: string[];
  };

  @ApiPropertyOptional({ description: 'Use done-for-you mode (team runs it)' })
  @IsOptional() @IsBoolean()
  doneForYou?: boolean = false;

  @ApiPropertyOptional({ enum: [...NG_FESTIVE_CAMPAIGNS] })
  @IsOptional() @IsIn(NG_FESTIVE_CAMPAIGNS)
  festiveCampaign?: NgFestiveCampaign;
}

export class GenerateAdCreativeDto {
  @ApiProperty({ description: 'Product or offer description' })
  @IsString() @IsNotEmpty()
  offer: string;

  @ApiProperty({ enum: ['meta', 'google', 'tiktok'] })
  @IsIn(['meta', 'google', 'tiktok'])
  platform: string;

  @ApiPropertyOptional({ description: 'Number of ad copy variants', default: 3 })
  @IsOptional() @IsNumber() @Min(1) @Max(10)
  variants?: number = 3;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional() @IsIn(NG_LANGUAGES)
  language?: string = 'english';
}