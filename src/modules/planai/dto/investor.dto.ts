import { IsString, IsOptional, IsNotEmpty, IsNumber, Min, Max, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateSafeDto {
  @ApiProperty({ description: 'Company name' })
  @IsString() @IsNotEmpty()
  companyName: string;

  @ApiProperty({ description: 'Investor name or entity' })
  @IsString() @IsNotEmpty()
  investorName: string;

  @ApiProperty({ description: 'Investment amount in Naira' })
  @IsNumber() @Min(0)
  investmentAmountNGN: number;

  @ApiPropertyOptional({ description: 'Valuation cap in Naira' })
  @IsOptional() @IsNumber() @Min(0)
  valuationCapNGN?: number;

  @ApiPropertyOptional({ description: 'Discount rate %' })
  @IsOptional() @IsNumber() @Min(0) @Max(50)
  discountRatePercent?: number;

  @ApiPropertyOptional({ description: 'CAC registration number' })
  @IsOptional() @IsString()
  cacRegNumber?: string;
}

export class DataRoomDto {
  @ApiProperty({ description: 'Startup name' })
  @IsString() @IsNotEmpty()
  startupName: string;

  @ApiPropertyOptional({ description: 'Document categories to create' })
  @IsOptional() @IsArray()
  @IsIn(['financials', 'legal', 'team', 'product', 'market', 'pitch'], { each: true })
  sections?: string[];
}