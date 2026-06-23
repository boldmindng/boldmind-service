import {
  IsString, IsOptional, IsNotEmpty, IsInt, IsEmail, IsArray, IsIn, Min, Max,
  MaxLength, ValidateNested, ArrayMinSize, ArrayMaxSize, Matches, 
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_STATES, ORDER_STATUSES } from '../planai.types';

export class OrderItemDto {
  @IsString() @IsNotEmpty()
  productId: string;

  @IsInt() @Min(1) @Max(1000)
  quantity: number;
}

export class DeliveryAddressDto {
  @IsString() @IsNotEmpty() @MaxLength(300)
  address: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  city: string;

  @IsIn(NG_STATES)
  state: string;

  @IsString() @IsNotEmpty() @MaxLength(100)
  lga: string;
}

export class PlaceOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsString() @IsNotEmpty() @MaxLength(200)
  customerName: string;

  @IsEmail()
  customerEmail: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?234[0-9]{10}$|^0[7-9][0-1][0-9]{8}$/, {
    message: 'Enter a valid Nigerian phone number',
  })
  customerPhone?: string;

  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status: string;

  @IsOptional() @IsString() @MaxLength(200)
  trackingCode?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class GetOrdersQueryDto {
  @IsOptional() @IsIn([...ORDER_STATUSES, ''])
  status?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  search?: string;
}