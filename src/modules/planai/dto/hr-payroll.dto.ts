import { IsString, IsOptional, IsNotEmpty, IsEmail, IsNumber, Min, Max, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @IsNotEmpty()
  firstName: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  lastName: string;

  @ApiProperty() @IsEmail()
  email: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  phone?: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  role: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  department?: string;

  @ApiProperty({ description: 'Monthly gross salary in Naira' })
  @IsNumber() @Min(0)
  monthlySalaryNGN: number;

  @ApiPropertyOptional({ description: 'Start date ISO string' })
  @IsOptional() @IsString()
  startDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  bankName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ description: 'Pension Fund Administrator code' })
  @IsOptional() @IsString()
  pfaCode?: string;
}

export class RunPayrollDto {
  @ApiProperty({ description: 'Payroll month 1-12' })
  @IsNumber() @Min(1) @Max(12)
  month: number;

  @ApiProperty({ description: 'Payroll year' })
  @IsNumber() @Min(2024)
  year: number;

  @ApiPropertyOptional({ description: 'Specific employee IDs (empty = all active)' })
  @IsOptional() @IsArray() @IsString({ each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ description: 'Generate salary bank upload file' })
  @IsOptional() @IsBoolean()
  generateBankFile?: boolean = false;

  @ApiPropertyOptional({ description: 'Delivery payslips via WhatsApp' })
  @IsOptional() @IsBoolean()
  deliverPayslips?: boolean = true;
}