import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
  IsPositive,
  IsArray,
  IsIn,
  IsBoolean,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NG_STATES } from "../planai.types";

export class GeneratePitchDeckDto {
  @IsString() businessName: string;
  @IsString() industry: string;
  @IsString() problemStatement: string;
  @IsString() solution: string;
  @IsString() teamBackground: string;
  @IsOptional() @IsString() traction?: string;
  @IsOptional() @IsNumber() @IsPositive() fundingAskNGN?: number;
  @IsOptional() @IsString() targetMarket?: string;
}

export class GenerateBusinessPlanDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  businessName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  industry: string;

  @ApiProperty({ description: "Brief description of the business" })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: "Target Nigerian state(s)" })
  @IsOptional()
  @IsArray()
  @IsIn(NG_STATES, { each: true })
  targetStates?: string[];

  @ApiPropertyOptional({ description: "Monthly revenue target in Naira" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  revenueTargetNGN?: number;

  @ApiPropertyOptional({ description: "Startup capital in Naira" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  startupCapitalNGN?: number;

  @ApiProperty({ description: "Output format", enum: ["pdf", "docx", "json"] })
  @IsIn(["pdf", "docx", "json"])
  outputFormat: "pdf" | "docx" | "json";

  @ApiPropertyOptional({ description: "Bank loan ready format" })
  @IsOptional()
  @IsBoolean()
  bankLoanFormat?: boolean = false;
}

export class FinancialForecastDto {
  @ApiPropertyOptional({ description: "Starting monthly revenue in Naira" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentMonthlyRevenueNGN?: number;

  @ApiPropertyOptional({ description: "Monthly expenses in Naira" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyExpensesNGN?: number;

  @ApiProperty({
    description: "Forecast months (3, 6, or 12)",
    enum: [3, 6, 12],
  })
  @IsIn([3, 6, 12])
  forecastMonths: number;

  @ApiPropertyOptional({ description: "Expected monthly growth rate %" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  growthRatePercent?: number;

  @ApiPropertyOptional({ description: "Include FX impact modelling" })
  @IsOptional()
  @IsBoolean()
  includeFXImpact?: boolean = false;

  @ApiPropertyOptional({
    description: "Scenario: base, best, worst",
    enum: ["base", "best", "worst", "all"],
  })
  @IsOptional()
  @IsIn(["base", "best", "worst", "all"])
  scenario?: string = "base";
}

export class GenerateForecastDto {
  @IsString() businessName: string;
  @IsString() industry: string;
  @IsNumber() currentMonthlyRevenue: number;
  @IsNumber() expectedGrowthPercent: number;
  @IsNumber() fixedExpensesNGN: number;
  @IsNumber() variableCostPercent: number;
  @IsNumber() startingCashNGN: number;
  @IsArray() @IsString({ each: true }) revenueSources: string[];
  @IsOptional() @IsString() upcomingExpenses?: string;
  @IsOptional() @IsString() context?: string;
}

export class GenerateScenarioDto extends GenerateForecastDto {}

export class CalculateBreakEvenDto {
  @IsNumber() fixedCostsNGN: number;
  @IsNumber() variableCostPerUnit: number;
  @IsNumber() pricePerUnit: number;
  @IsOptional() @IsNumber() currentUnits?: number;
}
