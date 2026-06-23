import {
  IsString, IsOptional, IsIn, IsBoolean, IsArray, IsUrl, IsInt, IsNumber, Min, Max,
  MinLength, MaxLength, ArrayMaxSize, ArrayMinSize, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/mapped-types';
import { Type, Transform } from 'class-transformer';

export class CreateProductDto {
  @IsString() @IsNotEmpty() @MinLength(2) @MaxLength(200)
  name: string;

  @IsOptional() @IsString() @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt({ message: 'price must be an integer in Kobo' })
  @Min(100) @Max(10_000_000_00)
  price?: number;

  @IsOptional() @IsNumber() @Min(1)
  priceNGN?: number;

  @IsOptional() @IsInt() @Min(0)
  comparePrice?: number;

  @IsOptional() @IsString() @MaxLength(100)
  category?: string;

  @IsOptional() @IsString() @MaxLength(100)
  sku?: string;

  @IsOptional() @IsInt() @Min(0)
  stock?: number;

  @IsOptional() @IsInt() @Min(0)
  stockQuantity?: number;

  @IsOptional() @IsBoolean()
  trackInventory?: boolean;

  @IsOptional()
  @IsArray() @ArrayMaxSize(10)
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  imageUrls?: string[];

  @IsOptional()
  @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(10)
  images?: string[];

  @IsOptional()
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional() @IsNumber() @Min(0)
  weight?: number;

  @IsOptional() @IsBoolean()
  isDigital?: boolean;

  @IsOptional()
  @IsUrl({}, { message: 'Download URL must be a valid URL' })
  downloadUrl?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class AddProductDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ description: 'Price in Naira' })
  @IsNumber() @Min(0)
  priceNGN: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber() @Min(0)
  comparePriceNGN?: number;

  @ApiProperty({ description: 'Stock quantity' })
  @IsNumber() @Min(0)
  stock: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  imageUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

// Query DTOs
export class GetProductsQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsIn(['price_asc', 'price_desc', 'newest', 'popular'])
  sort?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  maxPrice?: number;
}