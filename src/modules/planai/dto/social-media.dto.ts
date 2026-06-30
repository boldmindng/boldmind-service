import {
  IsString, IsOptional, IsNotEmpty, IsBoolean, IsArray, IsObject, IsIn, IsNumber, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import {
  SOCIAL_PLATFORMS, NG_LANGUAGES, NG_FESTIVE_CAMPAIGNS, SocialPlatform, NgFestiveCampaign,
} from '../planai.types';

// Receptionist
export class CreateReceptionistDto {
  @ApiProperty({ example: 'My Awesome Business' })
  @IsString()
  businessName: string;

  @ApiPropertyOptional({ example: 'friendly and professional' })
  @IsString() @IsOptional()
  tone?: string;

  @ApiPropertyOptional({ example: 'Nigerian business' })
  @IsString() @IsOptional()
  businessType?: string;

  @ApiPropertyOptional({ example: 'Hello! How can I help you today?' })
  @IsString() @IsOptional()
  greeting?: string;

  @ApiPropertyOptional({ description: 'Knowledge base object containing FAQs' })
  @IsObject() @IsOptional()
  knowledgeBase?: Record<string, any>;

  @ApiPropertyOptional({ example: ['manager', 'human', 'complaint', 'supervisor'] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  escalationTriggers?: string[];

  @ApiPropertyOptional({ description: 'Facebook Page ID' })
  @IsString() @IsOptional()
  pageId?: string;

  @ApiPropertyOptional({ description: 'Instagram Business ID' })
  @IsString() @IsOptional()
  igBusinessId?: string;

  @ApiPropertyOptional({ description: 'WhatsApp Phone Number ID' })
  @IsString() @IsOptional()
  waPhoneNumberId?: string;

  @ApiPropertyOptional({ description: 'Meta App Access Token' })
  @IsString() @IsOptional()
  accessToken?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Hello formatting the way you wanted!' })
  @IsString() @IsNotEmpty()
  message: string;
}

export class UpdateReceptionistDto extends PartialType(CreateReceptionistDto) {
  @IsBoolean() @IsOptional()
  isActive?: boolean;
}

// Social Content
export class GenerateCaptionDto {
  @ApiProperty({ description: 'Post topic or product name' })
  @IsString() @IsNotEmpty()
  topic: string;

  @ApiPropertyOptional({ enum: SOCIAL_PLATFORMS })
  @IsOptional() @IsIn(SOCIAL_PLATFORMS)
  platform?: SocialPlatform = 'instagram';

  @ApiPropertyOptional({ description: 'Brand voice description' })
  @IsOptional() @IsString()
  brandVoice?: string;

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional() @IsIn(NG_LANGUAGES)
  language?: string = 'english';

  @ApiPropertyOptional({ description: 'Include Pidgin version' })
  @IsOptional() @IsBoolean()
  includePidgin?: boolean = false;

  @ApiPropertyOptional({ description: 'Hashtag count', default: 10 })
  @IsOptional() @IsNumber() @Min(0) @Max(30)
  hashtagCount?: number = 10;
}

export class SchedulePostDto {
  @ApiProperty({ description: 'Post content' })
  @IsString() @IsNotEmpty()
  content: string;

  @ApiProperty({ isArray: true, enum: SOCIAL_PLATFORMS })
  @IsArray() @IsIn(SOCIAL_PLATFORMS, { each: true })
  platforms: SocialPlatform[];

  @ApiPropertyOptional({ description: 'ISO datetime to schedule' })
  @IsOptional() @IsString()
  scheduledAt?: string;

  @ApiPropertyOptional({ description: 'Media URLs' })
  @IsOptional() @IsArray() @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  bestTime?: boolean = false;
}

export class BulkContentDto {
  @ApiProperty({ description: 'Business/product description for content generation' })
  @IsString() @IsNotEmpty()
  businessDescription: string;

  @ApiProperty({ description: 'Number of posts to generate (max 30)', default: 10 })
  @IsNumber() @Min(1) @Max(30)
  count: number;

  @ApiPropertyOptional({ isArray: true, enum: SOCIAL_PLATFORMS })
  @IsOptional() @IsArray()
  platforms?: SocialPlatform[];

  @ApiPropertyOptional({ enum: NG_LANGUAGES })
  @IsOptional() @IsIn(NG_LANGUAGES)
  language?: string = 'english';
}

export class AutoReplyConfigDto {
  @ApiProperty({ enum: ['instagram_dm', 'whatsapp', 'facebook_message'] })
  @IsIn(['instagram_dm', 'whatsapp', 'facebook_message'])
  channel: string;

  @ApiProperty({ description: 'FAQ data keyed by question' })
  @IsObject()
  faqData: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  greetingMessage?: string;

  @ApiPropertyOptional({ description: 'Keywords that trigger human escalation' })
  @IsOptional() @IsArray() @IsString({ each: true })
  escalationKeywords?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  appointmentEnabled?: boolean = false;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  calendarUrl?: string;
}