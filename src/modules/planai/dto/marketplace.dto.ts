import { IsString, IsOptional, IsNotEmpty, IsIn, IsNumber, Min, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_STATES } from '../planai.types';

export class CreateServiceListingDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Service category e.g. design, photography, catering' })
  @IsString() @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Base price in Naira' })
  @IsNumber() @Min(0)
  basePriceNGN: number;

  @ApiPropertyOptional({ description: 'Video showcase URL (30-second clip)' })
  @IsOptional() @IsString()
  videoShowcaseUrl?: string;

  @ApiPropertyOptional({ enum: NG_STATES })
  @IsOptional() @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  lga?: string;

  @ApiPropertyOptional({ description: 'Same-day or next-day availability' })
  @IsOptional() @IsIn(['same_day', 'next_day', 'scheduled'])
  availability?: string;
}

export class CreateDigitalProductDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Product type e.g. template, course, ebook, tool' })
  @IsIn(['template', 'course', 'ebook', 'tool', 'download'])
  productType: string;

  @ApiProperty({ description: 'Price in Naira (0 = free)' })
  @IsNumber() @Min(0)
  priceNGN: number;

  @ApiProperty({ description: 'Download file URL (Cloudflare R2)' })
  @IsString() @IsNotEmpty()
  fileUrl: string;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

export class BookServiceDto {
  @ApiProperty({ description: 'Service listing ID' })
  @IsString() @IsNotEmpty()
  listingId: string;

  @ApiPropertyOptional({ description: 'Requested date ISO string' })
  @IsOptional() @IsString()
  requestedDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Delivery address' })
  @IsOptional() @IsObject()
  deliveryAddress?: Record<string, string>;
}