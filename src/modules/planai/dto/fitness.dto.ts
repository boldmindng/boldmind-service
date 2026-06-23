import {
  IsString, IsOptional, IsBoolean, IsNumber, IsArray, IsIn, Min, Max,
  IsEnum, IsObject, IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FitnessGoal, WorkoutType } from '@prisma/client';

export class CreateFitnessProfileDto {
  @ApiProperty({ enum: FitnessGoal, default: FitnessGoal.GENERAL_WELLNESS })
  @IsEnum(FitnessGoal)
  goal: FitnessGoal;

  @ApiPropertyOptional({ default: 'beginner' })
  @IsOptional() @IsString()
  fitnessLevel?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  heightCm?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  targetWeightKg?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  age?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  gender?: string;

  @ApiPropertyOptional({ default: 'sedentary' })
  @IsOptional() @IsString()
  activityLevel?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  dietaryPrefs?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  allergies?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  hasGymAccess?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  equipmentAvailable?: string[];
}

export class GenerateWorkoutPlanDto {
  @ApiProperty({ enum: FitnessGoal })
  @IsEnum(FitnessGoal)
  goal: FitnessGoal;

  @ApiProperty({ description: 'Duration in weeks' })
  @IsNumber() @Min(1)
  durationWeeks: number;

  @ApiProperty({ description: 'Days per week' })
  @IsNumber() @Min(1) @Max(7)
  daysPerWeek: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  fitnessLevel?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsArray() @IsString({ each: true })
  equipment?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  hasGymAccess?: boolean;
}

export class LogMealDto {
  @ApiProperty()
  @IsString()
  mealName: string;

  @ApiProperty({ example: 'breakfast' })
  @IsString()
  mealType: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsNumber()
  servingSize?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  foods?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isNigerianDish?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'ISO date of meal (default: today)' })
  @IsOptional() @IsDateString()
  date?: string;
}

export class BodyMetricDto {
  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  bodyFat?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  muscleMass?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

export class LogWorkoutDto {
  @ApiPropertyOptional({
    enum: WorkoutType,
    default: WorkoutType.HOME_WORKOUT,
    description: 'Type of workout performed',
  })
  @IsOptional()               // ← this was missing
  @IsEnum(WorkoutType)
  type?: WorkoutType = WorkoutType.HOME_WORKOUT;   // default also clarifies it’s optional

  @ApiProperty()
  @IsNumber() @Min(1)
  durationMinutes: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  workoutName?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  exercises?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  caloriesBurned?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  mood?: string;

  @ApiPropertyOptional({ description: 'ISO date of workout (default: now)' })
  @IsOptional() @IsDateString()
  date?: string;
}