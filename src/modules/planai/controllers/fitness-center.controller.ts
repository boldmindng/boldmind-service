import {
    Controller, Post, Get, Patch, Body, Param, Query, UseGuards,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {  FitnessCenterService } from '../services/fitness-center.service';
import { GenerateWorkoutPlanDto, LogWorkoutDto, LogMealDto } from '../dto/fitness.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';

@ApiTags('Fitness')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('planai/fitness')
export class FitnessCenterController {
    constructor(private readonly fitnessService: FitnessCenterService) { }

    // ─── PROFILE ──────────────────────────────────────────────

    @Get('profile')
    @ApiOperation({ summary: 'Get or create fitness profile' })
    getProfile(@CurrentUser('id') userId: string) {
        return this.fitnessService.getOrCreateProfile(userId);
    }

    @Patch('profile')
    @ApiOperation({ summary: 'Update fitness profile' })
    updateProfile(
        @CurrentUser('id') userId: string,
        @Body() data: { age?: number; weight?: number; height?: number; goal?: any; activityLevel?: string; dietaryPreferences?: string[] },
    ) {
        return this.fitnessService.updateProfile(userId, data);
    }

    // ─── WORKOUT PLANS ────────────────────────────────────────

    @Post('plans/generate')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Generate AI workout plan' })
    generatePlan(
        @CurrentUser('id') userId: string,
        @Body() dto: GenerateWorkoutPlanDto,
    ) {
        return this.fitnessService.generateWorkoutPlan(userId, dto);
    }

    @Get('plans')
    @ApiOperation({ summary: 'Get all workout plans' })
    getPlans(@CurrentUser('id') userId: string) {
        return this.fitnessService.getWorkoutPlans(userId);
    }

    @Get('plans/:id')
    @ApiOperation({ summary: 'Get a specific workout plan' })
    getPlan(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.fitnessService.getWorkoutPlan(id, userId);
    }

    // ─── WORKOUT LOG ──────────────────────────────────────────

    @Post('workouts')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Log a workout session' })
    logWorkout(
        @CurrentUser('id') userId: string,
        @Body() dto: LogWorkoutDto,
    ) {
        return this.fitnessService.logWorkout(userId, dto);
    }

    @Get('workouts')
    @ApiOperation({ summary: 'Get workout history' })
    getWorkoutHistory(
        @CurrentUser('id') userId: string,
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ) {
        return this.fitnessService.getWorkoutHistory(userId, +page, +limit);
    }

    // ─── MEALS ────────────────────────────────────────────────

    @Post('meals')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Log a meal' })
    logMeal(
        @CurrentUser('id') userId: string,
        @Body() dto: LogMealDto,
    ) {
        return this.fitnessService.logMeal(userId, dto);
    }

    @Get('meals')
    @ApiOperation({ summary: 'Get meal history (optionally by date)' })
    getMealHistory(
        @CurrentUser('id') userId: string,
        @Query('date') date?: string,
    ) {
        return this.fitnessService.getMealHistory(userId, date);
    }

    @Post('meals/analyze')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'AI-analyze a meal from text description' })
    analyzeMeal(
        @CurrentUser('id') userId: string,
        @Body('description') description: string,
    ) {
        return this.fitnessService.analyzeMealFromText(userId, description);
    }

    // ─── BODY METRICS ─────────────────────────────────────────

    @Post('metrics')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Log body metrics (weight, body fat, etc.)' })
    logMetrics(
        @CurrentUser('id') userId: string,
        @Body() data: { weight?: number; bodyFat?: number; muscleMass?: number; notes?: string },
    ) {
        return this.fitnessService.logBodyMetrics(userId, data);
    }

    @Get('metrics')
    @ApiOperation({ summary: 'Get body metrics history' })
    getMetricsHistory(
        @CurrentUser('id') userId: string,
        @Query('days') days = 30,
    ) {
        return this.fitnessService.getBodyMetricsHistory(userId, +days);
    }

    // ─── DASHBOARD ────────────────────────────────────────────

    @Get('dashboard')
    @ApiOperation({ summary: 'Get fitness dashboard with stats' })
    getDashboard(@CurrentUser('id') userId: string) {
        return this.fitnessService.getDashboard(userId);
    }
}
