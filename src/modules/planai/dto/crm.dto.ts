import { IsString, IsOptional, IsNotEmpty, IsEmail, IsArray, IsIn, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NG_STATES } from '../planai.types';

export class CreateContactDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  company?: string;

  @ApiPropertyOptional() @IsOptional() @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Custom notes' })
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Tags for segmentation' })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];
}

export class CreateDealDto {
  @ApiProperty({ description: 'Contact ID' })
  @IsString() @IsNotEmpty()
  contactId: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Deal value in Naira' })
  @IsNumber() @Min(0)
  valueNGN: number;

  @ApiPropertyOptional({ enum: ['NEW', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'] })
  @IsOptional() @IsIn(['NEW', 'CONTACTED', 'PROPOSAL', 'WON', 'LOST'])
  stage?: string = 'NEW';

  @ApiPropertyOptional() @IsOptional() @IsString()
  expectedCloseDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;
}