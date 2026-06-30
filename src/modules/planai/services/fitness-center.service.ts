import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { RedisService } from "../../../database/redis.service";
import { AiService } from "../../ai/ai.service";
import { FitnessGoal, WorkoutType } from "@prisma/client";
import {
  GenerateWorkoutPlanDto,
  LogWorkoutDto,
  LogMealDto,
} from "../dto/fitness.dto";

@Injectable()
export class FitnessCenterService {
  private readonly logger = new Logger(FitnessCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  // ─── PROFILE METHODS (matching controller) ────────────────────────────────────

  /** Returns an existing profile or creates a default one if missing */
  async getOrCreateProfile(userId: string) {
    const existing = await this.prisma.fitnessProfile.findUnique({
      where: { userId },
    });
    if (existing) return this.enrichProfile(existing);

    // Create default profile
    const newProfile = await this.prisma.fitnessProfile.create({
      data: {
        userId,
        goal: FitnessGoal.GENERAL_WELLNESS,
        fitnessLevel: "beginner",
        activityLevel: "sedentary",
        hasGymAccess: false,
      },
    });
    return this.enrichProfile(newProfile);
  }

  async updateProfile(
    userId: string,
    input: {
      age?: number;
      weight?: number;
      height?: number;
      goal?: string;
      activityLevel?: string;
      dietaryPreferences?: string[];
    },
  ) {
    const profile = await this.prisma.fitnessProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    const updated = await this.prisma.fitnessProfile.update({
      where: { userId },
      data: {
        ...(input.age !== undefined ? { age: input.age } : {}),
        ...(input.weight !== undefined ? { weightKg: input.weight } : {}),
        ...(input.height !== undefined ? { heightCm: input.height } : {}),
        ...(input.goal !== undefined
          ? { goal: input.goal as FitnessGoal }
          : {}),
        ...(input.activityLevel !== undefined
          ? { activityLevel: input.activityLevel }
          : {}),
        ...(input.dietaryPreferences !== undefined
          ? { dietaryPrefs: input.dietaryPreferences }
          : {}),
      },
    });
    return this.enrichProfile(updated);
  }

  // ─── WORKOUT PLAN METHODS ─────────────────────────────────────────────────────

  async generateWorkoutPlan(userId: string, dto?: GenerateWorkoutPlanDto) {
    const profile = await this.prisma.fitnessProfile.findUnique({
      where: { userId },
    });
    if (!profile)
      throw new NotFoundException("Set up your fitness profile first");

    // Override profile values with dto if provided
    const goal = dto?.goal ?? profile.goal;
    const weeks = dto?.durationWeeks ?? 4;
    const days = dto?.daysPerWeek ?? 4;
    const level = dto?.fitnessLevel ?? profile.fitnessLevel;
    const equipment = dto?.equipment ?? profile.equipmentAvailable;
    const gym = dto?.hasGymAccess ?? profile.hasGymAccess;

    const cacheKey = `fitness:plan:${userId}:${goal}:${level}:${weeks}:${days}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;

    const result = await this.ai.generateJson<{
      planName: string;
      durationWeeks: number;
      daysPerWeek: number;
      goal: string;
      workouts: Array<{
        day: number;
        name: string;
        type: string;
        durationMinutes: number;
        exercises: Array<{
          name: string;
          sets?: number;
          reps?: string;
          durationSecs?: number;
          rest?: string;
          notes?: string;
        }>;
        caloriesBurn: number;
      }>;
      nutritionTips: string[];
      progressMilestones: string[];
    }>(
      "You are a certified Nigerian fitness trainer who understands Nigerian bodies, diets, and lifestyles. Valid JSON only.",
      `Generate a personalised workout plan for a Nigerian.
Goal: ${goal}, Level: ${level}
Weight: ${profile.weightKg ?? "unknown"}kg, Height: ${profile.heightCm ?? "unknown"}cm
Gym access: ${gym ? "yes" : "no (home/outdoor only)"}
Equipment: ${(equipment ?? []).join(", ") || "none — bodyweight only"}
Duration: ${weeks} weeks, ${days} days/week

Return JSON: { planName, durationWeeks, daysPerWeek,
goal (friendly goal description),
workouts: [{ day (1-7), name, type (HIIT|STRENGTH|CARDIO|YOGA|OUTDOOR|HOME_WORKOUT),
  durationMinutes, caloriesBurn,
  exercises: [{ name, sets (optional), reps (optional, e.g. "12-15"), 
    durationSecs (optional), rest (e.g. "60s"), notes (form tip) }] }],
nutritionTips: [4 Nigerian-food-specific tips — jollof, egusi, suya etc.],
progressMilestones: [4 milestone checkpoints] }`,
      { task: "reasoning", temperature: 0.6 },
    );

    // Persist plan
    await this.prisma.workoutPlan.create({
      data: {
        userId,
        profileId: profile.id,
        name: result.content.planName,
        goal: goal as FitnessGoal,
        durationWeeks: result.content.durationWeeks,
        daysPerWeek: result.content.daysPerWeek,
        workouts: result.content.workouts,
        isAIGenerated: true,
        isActive: true,
      },
    });

    await this.redis.setex(cacheKey, 3600 * 24, JSON.stringify(result.content));
    return result.content;
  }

  async getWorkoutPlans(userId: string) {
    return this.prisma.workoutPlan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        goal: true,
        durationWeeks: true,
        daysPerWeek: true,
        isActive: true,
        completionRate: true,
        createdAt: true,
      },
    });
  }

  async getWorkoutPlan(id: string, userId: string) {
    const plan = await this.prisma.workoutPlan.findFirst({
      where: { id, userId },
    });
    if (!plan) throw new NotFoundException("Workout plan not found");
    return plan;
  }

  // ─── WORKOUT LOG METHODS ──────────────────────────────────────────────────────

  async logWorkout(userId: string, dto: LogWorkoutDto) {
    const log = await this.prisma.workoutLog.create({
      data: {
        userId,
        workoutName: dto.workoutName ?? "Workout Session",
        type: (dto.type as WorkoutType) ?? WorkoutType.HOME_WORKOUT,
        durationMinutes: dto.durationMinutes,
        exercises: dto.exercises ? JSON.stringify(dto.exercises) : undefined,
        caloriesBurned: dto.caloriesBurned,
        mood: dto.mood,
        notes: dto.notes,
        date: dto.date ? new Date(dto.date) : new Date(),
        completedAt: new Date(),
      },
    });

    await this.updateStreak(userId);
    if (dto.caloriesBurned) {
      await this.prisma.fitnessProfile
        .update({
          where: { userId },
          data: {
            totalWorkouts: { increment: 1 },
            totalCaloriesBurned: { increment: dto.caloriesBurned },
          },
        })
        .catch(() => {});
    }

    return log;
  }

  async getWorkoutHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.workoutLog.findMany({
        where: { userId },
        orderBy: { completedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.workoutLog.count({ where: { userId } }),
    ]);
    return { data, total, page, limit };
  }

  // ─── MEAL LOG METHODS ─────────────────────────────────────────────────────────

  async logMeal(userId: string, dto: LogMealDto) {
    const nutrition = await this.getNigerianNutrition(
      dto.mealName,
      dto.servingSize ?? 1,
    );

    const log = await this.prisma.mealLog.create({
      data: {
        userId,
        mealName: dto.mealName,
        mealType: dto.mealType,
        servingSize: dto.servingSize ?? 1,
        calories: nutrition.calories,
        proteinG: nutrition.proteinG,
        carbsG: nutrition.carbsG,
        fatG: nutrition.fatG,
        isNigerianDish: dto.isNigerianDish ?? true,
        imageUrl: dto.imageUrl,
        notes: dto.notes,
        date: dto.date ? new Date(dto.date) : new Date(),
        loggedAt: new Date(),
        totalCalories: nutrition.calories * (dto.servingSize ?? 1),
      },
    });

    return { ...log, nutrition };
  }

  async getMealHistory(userId: string, date?: string) {
    const where: any = { userId };
    if (date) {
      const d = new Date(date);
      const start = new Date(d.setHours(0, 0, 0, 0));
      const end = new Date(d.setHours(23, 59, 59, 999));
      where.loggedAt = { gte: start, lte: end };
    }
    return this.prisma.mealLog.findMany({
      where,
      orderBy: { loggedAt: "desc" },
    });
  }

  async analyzeMealFromText(userId: string, description: string) {
    const result = await this.ai.generateJson<{
      mealName: string;
      mealType: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      servingSize: number;
      isNigerian: boolean;
    }>(
      "You are a Nigerian nutritionist. Extract meal details from a text description. Valid JSON only.",
      `Analyze this meal description: "${description}". Return JSON: { mealName, mealType (breakfast/lunch/dinner/snack), calories, proteinG, carbsG, fatG, servingSize (default 1), isNigerian (boolean) }`,
      { task: "fast-chat", temperature: 0.2, cacheTtl: 3600 },
    );

    // Optionally log the meal automatically
    if (result.content) {
      await this.logMeal(userId, {
        mealName: result.content.mealName,
        mealType: result.content.mealType,
        servingSize: result.content.servingSize,
        isNigerianDish: result.content.isNigerian,
        notes: description,
      });
    }

    return result.content;
  }

  // ─── BODY METRICS ─────────────────────────────────────────────────────────────

  async logBodyMetrics(
    userId: string,
    input: {
      weight?: number;
      bodyFat?: number;
      muscleMass?: number;
      notes?: string;
    },
  ) {
    const log = await this.prisma.bodyMetricLog.create({
      data: {
        userId,
        weight: input.weight,
        bodyFat: input.bodyFat,
        muscleMass: input.muscleMass,
        notes: input.notes,
      },
    });

    if (input.weight) {
      await this.prisma.fitnessProfile
        .update({
          where: { userId },
          data: { weightKg: input.weight },
        })
        .catch(() => {});
    }

    return log;
  }

  async getBodyMetricsHistory(userId: string, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.bodyMetricLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────────

  async getDashboard(userId: string) {
    const profile = await this.prisma.fitnessProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException("Fitness profile not set up");

    const [streak, totalWorkouts, recentWorkouts, totalMealsToday, metrics] =
      await Promise.all([
        this.prisma.fitnessStreak.findUnique({ where: { userId } }),
        this.prisma.workoutLog.count({ where: { userId } }),
        this.prisma.workoutLog.findMany({
          where: { userId },
          orderBy: { completedAt: "desc" },
          take: 5,
          select: {
            workoutName: true,
            durationMinutes: true,
            caloriesBurned: true,
            completedAt: true,
          },
        }),
        this.prisma.mealLog.count({
          where: {
            userId,
            loggedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        this.prisma.bodyMetricLog.findFirst({
          where: { userId },
          orderBy: { createdAt: "desc" },
          select: {
            weight: true,
            bodyFat: true,
            muscleMass: true,
            createdAt: true,
          },
        }),
      ]);

    const calorieTarget = this.estimateCalorieTarget(profile);
    const todayNutrition = await this.getDailyNutrition(userId);

    return {
      profile,
      streak,
      totalWorkouts,
      recentWorkouts,
      totalMealsToday,
      latestMetrics: metrics,
      calorieTarget,
      todayNutrition: todayNutrition?.totals || null,
    };
  }

  // ─── EXISTING HELPER METHODS (unchanged logic) ────────────────────────────────

  async getNigerianNutrition(dishName: string, servings = 1) {
    const cacheKey = `fitness:nutrition:${dishName.toLowerCase().replace(/\s+/g, "_")}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const base = JSON.parse(cached) as Record<string, number>;
      return Object.fromEntries(
        Object.entries(base).map(([k, v]) => [
          k,
          typeof v === "number" ? v * servings : v,
        ]),
      );
    }

    // Nigerian food database — hardcoded for common dishes, AI for unknown ones
    const knownDishes: Record<
      string,
      { calories: number; proteinG: number; carbsG: number; fatG: number }
    > = {
      "jollof rice": { calories: 350, proteinG: 8, carbsG: 62, fatG: 8 },
      "egusi soup": { calories: 420, proteinG: 18, carbsG: 12, fatG: 32 },
      "pounded yam": { calories: 295, proteinG: 4, carbsG: 68, fatG: 1 },
      eba: { calories: 280, proteinG: 2, carbsG: 66, fatG: 0.5 },
      suya: { calories: 285, proteinG: 28, carbsG: 4, fatG: 17 },
      "moi moi": { calories: 180, proteinG: 14, carbsG: 20, fatG: 5 },
      akara: { calories: 220, proteinG: 12, carbsG: 18, fatG: 10 },
      "ofe onugbu": { calories: 380, proteinG: 16, carbsG: 8, fatG: 28 },
      "banga soup": { calories: 410, proteinG: 14, carbsG: 10, fatG: 35 },
      "ogbono soup": { calories: 395, proteinG: 15, carbsG: 9, fatG: 30 },
      "fried rice": { calories: 380, proteinG: 10, carbsG: 58, fatG: 12 },
      "ofada rice": { calories: 360, proteinG: 9, carbsG: 70, fatG: 4 },
      "pepper soup": { calories: 180, proteinG: 22, carbsG: 6, fatG: 8 },
      nkwobi: { calories: 450, proteinG: 30, carbsG: 4, fatG: 35 },
      beans: { calories: 330, proteinG: 20, carbsG: 55, fatG: 4 },
      plantain: { calories: 180, proteinG: 2, carbsG: 42, fatG: 1 },
      "fried plantain": { calories: 260, proteinG: 2, carbsG: 48, fatG: 8 },
      "yam and egg": { calories: 380, proteinG: 16, carbsG: 58, fatG: 10 },
      "garri with soup": { calories: 320, proteinG: 6, carbsG: 70, fatG: 3 },
      oats: { calories: 150, proteinG: 5, carbsG: 27, fatG: 3 },
      "bread and egg": { calories: 340, proteinG: 18, carbsG: 38, fatG: 12 },
      "indomie noodles": { calories: 380, proteinG: 8, carbsG: 62, fatG: 12 },
      shawarma: { calories: 520, proteinG: 24, carbsG: 56, fatG: 20 },
      "small chops": { calories: 420, proteinG: 12, carbsG: 40, fatG: 22 },
    };

    const key = dishName.toLowerCase().trim();
    const match = Object.keys(knownDishes).find(
      (k) => key.includes(k) || k.includes(key),
    );

    if (match) {
      const data = knownDishes[match]!;
      await this.redis.setex(cacheKey, 86400 * 7, JSON.stringify(data));
      return {
        ...data,
        calories: data.calories * servings,
        dish: dishName,
        source: "database",
      };
    }

    // AI lookup for unknown dishes
    const result = await this.ai.generateJson<{
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      fiberG: number;
    }>(
      "You are a Nigerian nutritionist. Provide accurate per-serving nutritional values. Valid JSON only.",
      `Estimate nutritional values for 1 standard serving of "${dishName}" (Nigerian portion size).
Return JSON: { calories, proteinG, carbsG, fatG, fiberG }
Numbers only — no units in values.`,
      { task: "fast-chat", temperature: 0.2, cacheTtl: 86400 * 7 },
    );

    await this.redis.setex(cacheKey, 86400 * 7, JSON.stringify(result.content));
    return {
      ...result.content,
      calories: result.content.calories * servings,
      dish: dishName,
      source: "ai",
    };
  }

  async getDailyNutrition(userId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const meals = await this.prisma.mealLog.findMany({
      where: { userId, loggedAt: { gte: startOfDay, lte: endOfDay } },
      orderBy: { loggedAt: "asc" },
    });

    const totals = meals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.totalCalories ?? 0),
        proteinG: acc.proteinG + (m.proteinG ?? 0),
        carbsG: acc.carbsG + (m.carbsG ?? 0),
        fatG: acc.fatG + (m.fatG ?? 0),
      }),
      { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    );

    // Target calories based on profile
    const profile = await this.prisma.fitnessProfile.findUnique({
      where: { userId },
    });
    const targetCalories = this.estimateCalorieTarget(profile);

    return {
      date: startOfDay.toISOString().split("T")[0],
      meals,
      totals,
      target: { calories: targetCalories },
      remaining: { calories: Math.max(0, targetCalories - totals.calories) },
      macroSplit: {
        proteinPct:
          totals.calories > 0
            ? Math.round(((totals.proteinG * 4) / totals.calories) * 100)
            : 0,
        carbsPct:
          totals.calories > 0
            ? Math.round(((totals.carbsG * 4) / totals.calories) * 100)
            : 0,
        fatPct:
          totals.calories > 0
            ? Math.round(((totals.fatG * 9) / totals.calories) * 100)
            : 0,
      },
    };
  }

  async getAICoachAdvice(userId: string, question: string) {
    // ... (same as before)
  }

  async getProgressHistory(userId: string, weeks = 12) {
    // ... (same as before)
  }

  private async updateStreak(userId: string) {
    const existing = await this.prisma.fitnessStreak.findUnique({
      where: { userId },
    });
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400_000);

    if (!existing) {
      await this.prisma.fitnessStreak.create({
        data: { userId, current: 1, longest: 1, lastWorkout: now },
      });
      return;
    }

    const lastWorkout = existing.lastWorkout;
    const isConsecutive = lastWorkout && lastWorkout >= yesterday;
    const newCurrent = isConsecutive ? existing.current + 1 : 1;
    const newLongest = Math.max(newCurrent, existing.longest);

    await this.prisma.fitnessStreak.update({
      where: { userId },
      data: { current: newCurrent, longest: newLongest, lastWorkout: now },
    });
  }

  private estimateCalorieTarget(
    profile: {
      weightKg: number | null;
      heightCm: number | null;
      age: number | null;
      gender: string | null;
      goal: FitnessGoal;
      activityLevel: string;
    } | null,
  ): number {
    if (!profile?.weightKg || !profile?.heightCm || !profile?.age) return 2000;

    // Mifflin-St Jeor equation
    const bmr =
      profile.gender === "female"
        ? 10 * profile.weightKg +
          6.25 * profile.heightCm -
          5 * profile.age -
          161
        : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5;

    const activityMultiplier: Record<string, number> = {
      sedentary: 1.2,
      lightly_active: 1.375,
      moderately_active: 1.55,
      very_active: 1.725,
      extra_active: 1.9,
    };
    const tdee = bmr * (activityMultiplier[profile.activityLevel] ?? 1.375);

    // Adjust for goal
    if (profile.goal === FitnessGoal.WEIGHT_LOSS) return Math.round(tdee - 500);
    if (profile.goal === FitnessGoal.MUSCLE_GAIN) return Math.round(tdee + 300);
    return Math.round(tdee);
  }

  private async enrichProfile(profile: any) {
    const [streak, totalWorkouts, recentLogs] = await Promise.all([
      this.prisma.fitnessStreak.findUnique({
        where: { userId: profile.userId },
      }),
      this.prisma.workoutLog.count({ where: { userId: profile.userId } }),
      this.prisma.workoutLog.findMany({
        where: { userId: profile.userId },
        orderBy: { completedAt: "desc" },
        take: 5,
        select: {
          workoutName: true,
          durationMinutes: true,
          caloriesBurned: true,
          completedAt: true,
        },
      }),
    ]);
    return { ...profile, streak, totalWorkouts, recentWorkouts: recentLogs };
  }
}
