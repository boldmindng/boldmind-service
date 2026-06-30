import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsIn,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NG_STATES } from "../planai.types";

export class SearchBusinessesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ enum: NG_STATES })
  @IsOptional()
  @IsIn(NG_STATES)
  state?: string;

  @ApiPropertyOptional({ description: "LGA filter" })
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({
    description: "Business size",
    enum: ["micro", "small", "medium", "large"],
  })
  @IsOptional()
  @IsIn(["micro", "small", "medium", "large"])
  size?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => Number(value))
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => Number(value))
  limit?: number = 20;
}

export class FindContactsDto {
  @ApiProperty({ description: "Company name or domain" })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiPropertyOptional({
    description: "Job title filter e.g. CEO, Procurement",
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ description: "Verify email via SMTP", default: true })
  @IsOptional()
  @IsBoolean()
  verify?: boolean = true;
}
