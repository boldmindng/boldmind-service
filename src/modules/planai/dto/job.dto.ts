import { IsString, IsOptional, IsEnum, IsObject, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanAIJobType } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty({ enum: PlanAIJobType })
  @IsEnum(PlanAIJobType)
  type: PlanAIJobType;

  @ApiProperty({ description: 'Job input payload (tool-specific)' })
  @IsObject()
  input: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;
}

export class JobQueryDto {
  @ApiPropertyOptional({ enum: PlanAIJobType })
  @IsOptional()
  @IsEnum(PlanAIJobType)
  type?: PlanAIJobType;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @IsNumber() @Min(1)
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page size', default: 20 })
  @IsOptional()
  @IsNumber() @Min(1) @Max(100)
  @Transform(({ value }) => Number(value))
  limit?: number = 20;
}