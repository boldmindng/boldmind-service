// ═══════════════════════════════════════════════════════════════════════════════
// service/src/modules/educenter/educenter.service.ts
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { AiService } from '../ai/ai.service';
import { AlocService, NormalizedQuestion } from './services/aloc.service';
import { CBTSessionStatus, CourseStatus } from '@prisma/client';
import {
  StartCbtDto,
  SubmitAnswerDto,
  SubmitSessionDto,
  GetQuestionsDto,
  CreateCourseDto,
  UpdateCourseDto,
  EnrollCourseDto,
  UpdateProgressDto,
} from './dto/educenter.dto';
import * as crypto from 'crypto';

const XP_PER_CORRECT = 5;
const XP_PER_SESSION = 10;
const LEVEL_XP_THRESHOLDS = [0, 100, 250, 500, 1000, 2000, 3500, 5000, 7500, 10000];

@Injectable()
export class EduCenterService {
  private readonly logger = new Logger(EduCenterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly ai: AiService,
    private readonly aloc: AlocService,
  ) { }

  // ════════════════════════════════════════════════════════════════════════════
  // SUBJECTS & AVAILABLE EXAMS
  // ════════════════════════════════════════════════════════════════════════════

  async getSubjectsForExam(examType: string) {
    const subjects = await this.aloc.getSubjectsForExam(examType);
    const years = await this.aloc.getAvailableYears(examType, subjects[0]);
    return { examType, subjects, availableYears: years };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CBT SESSION — START
  // ════════════════════════════════════════════════════════════════════════════

  async startCbtSession(userId: string, dto: StartCbtDto) {
    const { examType, subject, year, mode } = dto;

    // Determine question count by exam type
    const questionCount = this.getQuestionCount(examType, mode);
    const timeLimitSecs = this.getTimeLimit(examType, mode);

    // Fetch questions from ALOC API (cached in Redis)
    const questions = await this.aloc.fetchQuestionsForSession({
      examType,
      subject,
      year,
      limit: questionCount,
    });

    if (questions.length === 0) {
      throw new BadRequestException(`No questions available for ${examType} / ${subject}`);
    }

    const questionIds = questions.map((q) => q.alocId);

    // Create CBT session in DB
    const session = await this.prisma.cBTSession.create({
      data: {
        userId,
        examType: examType as never,
        subject,
        year,
        totalQuestions: questions.length,
        timeLimitSecs,
        status: CBTSessionStatus.IN_PROGRESS,
        questionIds,
      },
    });

    // Cache the full question data in Redis for the session duration
    // (avoid re-fetching during the exam)
    const sessionQKey = `cbt:session:${session.id}:questions`;
    await this.redis.setex(sessionQKey, timeLimitSecs + 300, JSON.stringify(questions));

    // Cache per-question map for O(1) answer lookup
    const qMap: Record<string, NormalizedQuestion> = {};
    for (const q of questions) qMap[q.alocId] = q;
    await this.redis.setex(
      `cbt:session:${session.id}:qmap`,
      timeLimitSecs + 300,
      JSON.stringify(qMap),
    );

    return {
      sessionId: session.id,
      totalQuestions: questions.length,
      timeLimitSecs,
      examType,
      subject,
      year: year ?? null,
      // Strip answers before sending to client
      questions: questions.map((q) => ({
        alocId: q.alocId,
        question: q.question,
        options: q.options,
        imageUrl: q.imageUrl,
        subject: q.subject,
        year: q.year,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CBT SESSION — MULTI-SUBJECT (Full JAMB Mock)
  // ════════════════════════════════════════════════════════════════════════════

  async startFullMockExam(userId: string, dto: { examType: string; subjects: string[]; year?: number }) {
    const { examType, subjects, year } = dto;

    if (subjects.length < 2 || subjects.length > 4) {
      throw new BadRequestException('Full mock exam requires 2-4 subjects');
    }

    const questionsBySubject = await this.aloc.fetchMultiSubjectExam({
      examType,
      subjects,
      questionsPerSubject: 40,
      year,
    });

    const allQuestions: NormalizedQuestion[] = Object.values(questionsBySubject).flat();
    const questionIds = allQuestions.map((q) => q.alocId);
    const timeLimitSecs = subjects.length * 45 * 60; // 45 mins per subject

    const session = await this.prisma.cBTSession.create({
      data: {
        userId,
        examType: examType as never,
        subject: subjects.join(', '),
        year,
        totalQuestions: allQuestions.length,
        timeLimitSecs,
        status: CBTSessionStatus.IN_PROGRESS,
        questionIds,
      },
    });

    const sessionQKey = `cbt:session:${session.id}:questions`;
    await this.redis.setex(sessionQKey, timeLimitSecs + 300, JSON.stringify(allQuestions));

    const qMap: Record<string, NormalizedQuestion> = {};
    for (const q of allQuestions) qMap[q.alocId] = q;
    await this.redis.setex(`cbt:session:${session.id}:qmap`, timeLimitSecs + 300, JSON.stringify(qMap));

    return {
      sessionId: session.id,
      totalQuestions: allQuestions.length,
      timeLimitSecs,
      examType,
      subjects,
      subjectBreakdown: Object.fromEntries(
        Object.entries(questionsBySubject).map(([s, qs]) => [s, qs.length]),
      ),
      questions: allQuestions.map((q) => ({
        alocId: q.alocId,
        question: q.question,
        options: q.options,
        imageUrl: q.imageUrl,
        subject: q.subject,
        year: q.year,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CBT SESSION — SUBMIT FULL EXAM
  // ════════════════════════════════════════════════════════════════════════════

  async submitSession(userId: string, sessionId: string, dto: SubmitSessionDto) {
    const session = await this.prisma.cBTSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== CBTSessionStatus.IN_PROGRESS) {
      throw new BadRequestException('Session already completed');
    }

    // Load question map from Redis
    const qMapRaw = await this.redis.get(`cbt:session:${sessionId}:qmap`);
    if (!qMapRaw) {
      throw new BadRequestException('Session expired — please start a new exam');
    }
    const qMap = JSON.parse(qMapRaw) as Record<string, NormalizedQuestion>;

    // Score answers
    let score = 0;
    const progressRecords: Parameters<typeof this.prisma.studentProgress.create>[0]['data'][] = [];

    for (const answer of dto.answers) {
      const question = qMap[answer.alocId];
      if (!question) continue;

      const isCorrect = answer.selectedAnswer.toUpperCase() === question.answer;
      if (isCorrect) score++;

      progressRecords.push({
        userId,
        sessionId,
        examType: session.examType,
        subject: answer.subject ?? question.subject,
        alocQuestionId: answer.alocId,
        selectedAnswer: answer.selectedAnswer.toUpperCase(),
        correctAnswer: question.answer,
        isCorrect,
        timeTakenSecs: answer.timeTakenSecs ?? 0,
        isSkipped: answer.isSkipped ?? false,
        // Store snapshot for review (so user can see question without re-fetching)
        questionSnapshot: {
          question: question.question,
          options: question.options,
          explanation: question.explanation,
          imageUrl: question.imageUrl,
        },
      });
    }

    const percentage = (score / session.totalQuestions) * 100;
    const timeTakenSecs = dto.timeTakenSecs ?? session.timeLimitSecs;

    // Transact: update session + save progress + update streak + update subject performance
    await this.prisma.$transaction(async (tx) => {
      // Complete session
      await tx.cBTSession.update({
        where: { id: sessionId },
        data: {
          status: CBTSessionStatus.COMPLETED,
          score,
          percentage,
          timeTakenSecs,
          completedAt: new Date(),
        },
      });

      // Batch insert progress records
      if (progressRecords.length > 0) {
        await tx.studentProgress.createMany({ data: progressRecords as never });
      }

      // Update study streak
      await this.updateStudyStreak(tx, userId, score, progressRecords.length);

      // Update subject performance per subject
      const bySubject: Record<string, { correct: number; total: number }> = {};
      for (const p of progressRecords) {
        const key = `${session.examType}::${(p as { subject: string }).subject}`;
        if (!bySubject[key]) bySubject[key] = { correct: 0, total: 0 };
        bySubject[key].total++;
        if ((p as { isCorrect: boolean }).isCorrect) bySubject[key].correct++;
      }

      for (const [key, stats] of Object.entries(bySubject)) {
        const [examType, subject] = key.split('::');
        await this.upsertSubjectPerformance(tx, userId, examType, subject, stats);
      }
    });

    // Clean up Redis session cache
    void this.redis.del(`cbt:session:${sessionId}:questions`);
    void this.redis.del(`cbt:session:${sessionId}:qmap`);

    // Get updated streak for response
    const streak = await this.prisma.studyStreak.findUnique({ where: { userId } });

    return {
      sessionId,
      score,
      totalQuestions: session.totalQuestions,
      percentage: Math.round(percentage * 10) / 10,
      timeTakenSecs,
      grade: this.calculateGrade(percentage),
      xpEarned: score * XP_PER_CORRECT + XP_PER_SESSION,
      currentStreak: streak?.currentStreak ?? 0,
      currentLevel: streak?.level ?? 1,
      xpPoints: streak?.xpPoints ?? 0,
      // Return review data (answers with correct answers revealed)
      review: dto.answers.map((a) => {
        const q = qMap[a.alocId];
        return {
          alocId: a.alocId,
          question: q?.question,
          options: q?.options,
          yourAnswer: a.selectedAnswer.toUpperCase(),
          correctAnswer: q?.answer,
          isCorrect: a.selectedAnswer.toUpperCase() === q?.answer,
          explanation: q?.explanation,
        };
      }),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CBT SESSION — ABANDON / TIMEOUT
  // ════════════════════════════════════════════════════════════════════════════

  async abandonSession(userId: string, sessionId: string) {
    await this.prisma.cBTSession.updateMany({
      where: { id: sessionId, userId, status: CBTSessionStatus.IN_PROGRESS },
      data: { status: CBTSessionStatus.ABANDONED, completedAt: new Date() },
    });
    void this.redis.del(`cbt:session:${sessionId}:questions`);
    void this.redis.del(`cbt:session:${sessionId}:qmap`);
    return { message: 'Session abandoned' };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PERFORMANCE ANALYTICS
  // ════════════════════════════════════════════════════════════════════════════

  async getStudentDashboard(userId: string) {
    const cacheKey = `edu:dashboard:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const [streak, subjectPerformances, recentSessions, courseEnrollments] = await Promise.all([
      this.prisma.studyStreak.findUnique({ where: { userId } }),
      this.prisma.subjectPerformance.findMany({
        where: { userId },
        orderBy: { averagePercent: 'asc' },
      }),
      this.prisma.cBTSession.findMany({
        where: { userId, status: CBTSessionStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
        take: 10,
        select: {
          id: true, examType: true, subject: true, score: true,
          percentage: true, totalQuestions: true, timeTakenSecs: true, completedAt: true,
        },
      }),
      this.prisma.courseEnrollment.findMany({
        where: { userId },
        include: { course: { select: { id: true, title: true, thumbnailUrl: true, category: true } } },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    // Calculate trends — last 7 sessions average vs previous 7
    const last7 = recentSessions.slice(0, 7);
    const prev7 = recentSessions.slice(3, 10); // Overlap intentional for trend
    const avgRecent = last7.reduce((s, r) => s + (r.percentage ?? 0), 0) / (last7.length || 1);
    const avgPrev = prev7.reduce((s, r) => s + (r.percentage ?? 0), 0) / (prev7.length || 1);

    // Weak subjects (< 50% avg)
    const weakSubjects = subjectPerformances.filter((s) => s.averagePercent < 50);
    const strongSubjects = subjectPerformances.filter((s) => s.averagePercent >= 70);

    const dashboard = {
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        totalDays: streak?.totalDaysStudied ?? 0,
        xpPoints: streak?.xpPoints ?? 0,
        level: streak?.level ?? 1,
        nextLevelXp: this.getNextLevelXp(streak?.level ?? 1),
        xpProgress: this.getXpProgress(streak?.level ?? 1, streak?.xpPoints ?? 0),
        lastStudiedAt: streak?.lastStudiedAt ?? null,
        weeklyGoalDays: streak?.weeklyGoalDays ?? 5,
        totalSessions: streak?.totalSessionsDone ?? 0,
        totalQuestionsAnswered: streak?.totalQuestionsAnswered ?? 0,
        overallAccuracy: streak?.totalQuestionsAnswered
          ? Math.round(((streak.totalCorrect ?? 0) / streak.totalQuestionsAnswered) * 100)
          : 0,
      },
      performance: {
        recentAverage: Math.round(avgRecent),
        trend: avgRecent > avgPrev ? 'improving' : avgRecent < avgPrev ? 'declining' : 'stable',
        trendDelta: Math.round(avgRecent - avgPrev),
        weakSubjects: weakSubjects.map((s) => ({
          subject: s.subject,
          examType: s.examType,
          averagePercent: Math.round(s.averagePercent),
          totalAttempted: s.totalAttempted,
          weakTopics: s.weakTopics,
        })),
        strongSubjects: strongSubjects.map((s) => ({
          subject: s.subject,
          averagePercent: Math.round(s.averagePercent),
        })),
        bySubject: subjectPerformances.map((s) => ({
          subject: s.subject,
          examType: s.examType,
          averagePercent: Math.round(s.averagePercent),
          totalAttempted: s.totalAttempted,
          totalCorrect: s.totalCorrect,
          lastAttemptAt: s.lastAttemptAt,
        })),
      },
      recentSessions,
      enrolledCourses: courseEnrollments.map((e) => ({
        ...e.course,
        progressPercent: e.progressPercent,
        lastLessonId: e.lastLessonId,
      })),
    };

    await this.redis.setex(cacheKey, 300, JSON.stringify(dashboard)); // 5 min cache
    return dashboard;
  }

  async getSubjectAnalytics(userId: string, examType: string, subject: string) {
    const [perf, sessions] = await Promise.all([
      this.prisma.subjectPerformance.findUnique({
        where: { userId_examType_subject: { userId, examType: examType as never, subject } },
      }),
      this.prisma.cBTSession.findMany({
        where: { userId, examType: examType as never, subject, status: CBTSessionStatus.COMPLETED },
        orderBy: { completedAt: 'asc' },
        select: { id: true, score: true, percentage: true, totalQuestions: true, completedAt: true },
      }),
    ]);

    // Score progression chart data
    const progressionData = sessions.map((s) => ({
      date: s.completedAt,
      percentage: Math.round(s.percentage ?? 0),
      score: s.score,
      total: s.totalQuestions,
    }));

    return {
      subject,
      examType,
      overall: perf
        ? {
          totalAttempted: perf.totalAttempted,
          totalCorrect: perf.totalCorrect,
          averagePercent: Math.round(perf.averagePercent),
          weakTopics: perf.weakTopics,
          strongTopics: perf.strongTopics,
          lastAttemptAt: perf.lastAttemptAt,
        }
        : null,
      progression: progressionData,
      sessionsCount: sessions.length,
    };
  }

  async getSessionReview(userId: string, sessionId: string) {
    const session = await this.prisma.cBTSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const progress = await this.prisma.studentProgress.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      session: {
        id: session.id,
        examType: session.examType,
        subject: session.subject,
        score: session.score,
        percentage: session.percentage,
        totalQuestions: session.totalQuestions,
        timeTakenSecs: session.timeTakenSecs,
        completedAt: session.completedAt,
      },
      answers: progress.map((p) => ({
        alocId: p.alocQuestionId,
        selectedAnswer: p.selectedAnswer,
        correctAnswer: p.correctAnswer,
        isCorrect: p.isCorrect,
        timeTakenSecs: p.timeTakenSecs,
        isSkipped: p.isSkipped,
        // Snapshot includes question text + explanation stored at submission time
        ...(p.questionSnapshot as Record<string, unknown>),
      })),
      stats: {
        correct: progress.filter((p) => p.isCorrect).length,
        wrong: progress.filter((p) => !p.isCorrect && !p.isSkipped).length,
        skipped: progress.filter((p) => p.isSkipped).length,
        averageTimePerQuestion:
          progress.reduce((s, p) => s + p.timeTakenSecs, 0) / (progress.length || 1),
      },
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // LEADERBOARD
  // ════════════════════════════════════════════════════════════════════════════

  async getLeaderboard(params: {
    scope: 'global' | 'weekly' | 'monthly';
    examType?: string;
    limit?: number;
  }) {
    const { scope, examType, limit = 50 } = params;
    const cacheKey = `edu:leaderboard:${scope}:${examType ?? 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const dateFilter = this.getScopeDate(scope);

    if (scope === 'global') {
      // Global: ranked by XP points
      const streaks = await this.prisma.studyStreak.findMany({
        orderBy: { xpPoints: 'desc' },
        take: limit,
        include: {
          user: {
            select: {
              id: true, name: true, avatar: true,
              profile: { select: { displayName: true, avatarUrl: true, state: true } },
            },
          },
        },
      });

      const leaderboard = streaks.map((s, i) => ({
        rank: i + 1,
        userId: s.userId,
        name: s.user.profile?.displayName ?? s.user.name,
        avatar: s.user.profile?.avatarUrl ?? s.user.avatar,
        state: s.user.profile?.state,
        xpPoints: s.xpPoints,
        level: s.level,
        currentStreak: s.currentStreak,
        totalSessionsDone: s.totalSessionsDone,
        overallAccuracy: s.totalQuestionsAnswered
          ? Math.round((s.totalCorrect / s.totalQuestionsAnswered) * 100)
          : 0,
      }));

      await this.redis.setex(cacheKey, 300, JSON.stringify(leaderboard));
      return leaderboard;
    }

    // Weekly/Monthly: ranked by sessions completed + score in period
    const sessions = await this.prisma.cBTSession.groupBy({
      by: ['userId'],
      where: {
        status: CBTSessionStatus.COMPLETED,
        completedAt: { gte: dateFilter },
        ...(examType ? { examType: examType as never } : {}),
      },
      _count: { id: true },
      _avg: { percentage: true },
      _sum: { score: true },
      orderBy: { _sum: { score: 'desc' } },
      take: limit,
    });

    const userIds = sessions.map((s) => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true, name: true, avatar: true,
        profile: { select: { displayName: true, avatarUrl: true, state: true } },
        studyStreak: { select: { level: true, xpPoints: true } },
      },
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const leaderboard = sessions.map((s, i) => {
      const user = userMap[s.userId];
      return {
        rank: i + 1,
        userId: s.userId,
        name: user?.profile?.displayName ?? user?.name,
        avatar: user?.profile?.avatarUrl ?? user?.avatar,
        state: user?.profile?.state,
        sessionsCompleted: s._count.id,
        averageScore: Math.round(s._avg.percentage ?? 0),
        totalCorrect: s._sum.score ?? 0,
        level: user?.studyStreak?.level ?? 1,
        xpPoints: user?.studyStreak?.xpPoints ?? 0,
      };
    });

    const cacheTtl = scope === 'weekly' ? 3600 : 7200;
    await this.redis.setex(cacheKey, cacheTtl, JSON.stringify(leaderboard));
    return leaderboard;
  }

  async getMyRank(userId: string, scope: 'global' | 'weekly' | 'monthly') {
    const leaderboard = (await this.getLeaderboard({ scope })) as Array<{ userId: string; rank: number }>;
    const myEntry = leaderboard.find((e) => e.userId === userId);
    return {
      rank: myEntry?.rank ?? null,
      totalOnLeaderboard: leaderboard.length,
      scope,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STUDY STREAK MANAGEMENT
  // ════════════════════════════════════════════════════════════════════════════

  async getMyStreak(userId: string) {
    const streak = await this.prisma.studyStreak.findUnique({ where: { userId } });
    if (!streak) {
      return await this.prisma.studyStreak.create({ data: { userId } });
    }
    return streak;
  }

  async updateWeeklyGoal(userId: string, goalDays: number) {
    if (goalDays < 1 || goalDays > 7) throw new BadRequestException('Goal must be 1-7 days');
    return this.prisma.studyStreak.upsert({
      where: { userId },
      update: { weeklyGoalDays: goalDays },
      create: { userId, weeklyGoalDays: goalDays },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COURSE LIBRARY — CRUD
  // ════════════════════════════════════════════════════════════════════════════

  async listCourses(params: {
    category?: string;
    examType?: string;
    subject?: string;
    isPremium?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { category, examType, subject, isPremium, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          status: CourseStatus.PUBLISHED,
          ...(category ? { category } : {}),
          ...(examType ? { examType: examType as never } : {}),
          ...(subject ? { subject } : {}),
          ...(isPremium !== undefined ? { isPremium } : {}),
          ...(search
            ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { tags: { has: search.toLowerCase() } },
              ],
            }
            : {}),
        },
        select: {
          id: true, slug: true, title: true, description: true, category: true,
          examType: true, subject: true, thumbnailUrl: true, durationMins: true,
          totalLessons: true, price: true, isPremium: true, instructorName: true,
          rating: true, enrollmentCount: true, tags: true, prerequisites: true,
        },
        orderBy: [{ enrollmentCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.course.count({
        where: {
          status: CourseStatus.PUBLISHED,
          ...(category ? { category } : {}),
          ...(examType ? { examType: examType as never } : {}),
        },
      }),
    ]);

    return {
      courses,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getCourseBySlug(slug: string, userId?: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, title: true, durationMins: true, sortOrder: true,
            isFree: true, videoUrl: true,
            // Only expose content for free lessons or enrolled users
          },
        },
      },
    });

    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException('Course not found');
    }

    let enrollment = null;
    if (userId) {
      enrollment = await this.prisma.courseEnrollment.findUnique({
        where: { userId_courseId: { userId, courseId: course.id } },
      });
    }

    const isEnrolled = !!enrollment;

    return {
      ...course,
      lessons: course.lessons.map((lesson) => ({
        ...lesson,
        // Lock video URL for paid courses unless enrolled
        videoUrl: lesson.isFree || isEnrolled ? lesson.videoUrl : null,
        isLocked: !lesson.isFree && !isEnrolled,
      })),
      enrollment: enrollment
        ? { progressPercent: enrollment.progressPercent, lastLessonId: enrollment.lastLessonId }
        : null,
      isEnrolled,
    };
  }

  async enrollCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, price: true, isPremium: true, enrollmentCount: true },
    });
    if (!course) throw new NotFoundException('Course not found');

    if (course.isPremium && course.price > 0) {
      // Check subscription — must have active EduCenter sub
      const sub = await this.prisma.subscription.findFirst({
        where: { userId, productSlug: 'educenter', status: { in: ['ACTIVE', 'TRIAL'] } },
      });
      if (!sub) {
        throw new ForbiddenException('Premium courses require an active EduCenter subscription');
      }
    }

    const existing = await this.prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (existing) return { message: 'Already enrolled', enrollment: existing };

    const [enrollment] = await this.prisma.$transaction([
      this.prisma.courseEnrollment.create({ data: { userId, courseId } }),
      this.prisma.course.update({
        where: { id: courseId },
        data: { enrollmentCount: { increment: 1 } },
      }),
    ]);

    return { message: 'Enrolled successfully', enrollment };
  }

  async updateCourseProgress(userId: string, courseId: string, dto: UpdateProgressDto) {
    const enrollment = await this.prisma.courseEnrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { totalLessons: true },
    });

    const progressPercent =
      course?.totalLessons ? (dto.completedLessons / course.totalLessons) * 100 : dto.progressPercent ?? enrollment.progressPercent;

    const updated = await this.prisma.courseEnrollment.update({
      where: { userId_courseId: { userId, courseId } },
      data: {
        progressPercent: Math.min(100, progressPercent),
        lastLessonId: dto.lastLessonId,
        ...(progressPercent >= 100 ? { completedAt: new Date() } : {}),
      },
    });

    // Award XP for course completion
    if (progressPercent >= 100 && !enrollment.completedAt) {
      await this.prisma.studyStreak.upsert({
        where: { userId },
        update: { xpPoints: { increment: 50 } }, // 50 XP for course completion
        create: { userId, xpPoints: 50 },
      });
    }

    return updated;
  }

  async createCourse(instructorId: string, dto: CreateCourseDto) {
    const slug = await this.generateCourseSlug(dto.title);
    return this.prisma.course.create({
      data: {
        slug,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        examType: dto.examType as never | undefined,
        subject: dto.subject,
        thumbnailUrl: dto.thumbnailUrl,
        videoUrl: dto.videoUrl,
        durationMins: dto.durationMins ?? 0,
        price: dto.price ?? 0,
        isPremium: (dto.price ?? 0) > 0,
        instructorId,
        instructorName: dto.instructorName,
        tags: dto.tags ?? [],
        status: CourseStatus.DRAFT,
      },
    });
  }

  async publishCourse(courseId: string, instructorId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, instructorId },
    });
    if (!course) throw new NotFoundException('Course not found or not yours');

    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: CourseStatus.PUBLISHED },
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AI TUTORING — "AI Tools Training" feature
  // ════════════════════════════════════════════════════════════════════════════

  async askAiTutor(userId: string, params: {
    question: string;
    subject: string;
    examType: string;
    context?: string; // Optional: the actual question text for context
  }) {
    const { question, subject, examType, context } = params;

    const systemPrompt = `You are EduBot, an expert Nigerian exam preparation tutor specializing in ${examType} ${subject}.
You help students understand concepts, solve past questions, and prepare for JAMB, WAEC, NECO, and other Nigerian exams.
Be clear, encouraging, and use Nigerian examples where relevant. 
If the student is struggling, break down the concept step by step.
Keep explanations concise but complete.`;

    const userPrompt = context
      ? `The student is reviewing this question:\n\n"${context}"\n\nTheir question: ${question}`
      : question;

    const response = await this.ai.chat(systemPrompt, userPrompt);

    // Log AI tutor usage
    await this.prisma.activityLog.create({
      data: {
        userId,
        action: 'ai_tutor_question',
        productSlug: 'educenter',
        metadata: { subject, examType, questionLength: question.length },
      },
    });

    return { answer: response, subject, examType };
  }

  async generateStudyPlan(userId: string, params: {
    examType: string;
    subjects: string[];
    targetDate: string; // ISO date string of exam date
    studyHoursPerDay: number;
  }) {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const subjectPerfs = await this.prisma.subjectPerformance.findMany({ where: { userId } });

    const weakSubjects = subjectPerfs
      .filter((s) => s.averagePercent < 60)
      .map((s) => s.subject);

    const systemPrompt = `You are EduBot, a Nigerian exam study planner. Generate personalized, realistic study plans for students.`;
    const userPrompt = `Create a study plan for a Nigerian student preparing for ${params.examType}.
Exam date: ${params.targetDate}
Subjects: ${params.subjects.join(', ')}
Daily study hours available: ${params.studyHoursPerDay}
Weak subjects (need more attention): ${weakSubjects.join(', ') || 'None identified yet'}
Student state: ${profile?.state ?? 'Nigeria'}

Return a JSON object with:
- weeksUntilExam: number
- weeklyPlan: array of { week: number, focus: string, subjects: [{ subject, hours, topics: [] }], practiceTests: number }
- dailySchedule: { weekdays: string, weekends: string }
- tips: string[]
- milestones: [{ week: number, goal: string }]`;

    const plan = await this.ai.generateJson<{
      weeksUntilExam: number;
      weeklyPlan: unknown[];
      dailySchedule: Record<string, string>;
      tips: string[];
      milestones: unknown[];
    }>(systemPrompt, userPrompt);

    return plan.content;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MARKETING PLAYBOOKS (Course category = 'marketing-playbook')
  // ════════════════════════════════════════════════════════════════════════════

  async getMarketingPlaybooks(userId?: string) {
    const courses = await this.prisma.course.findMany({
      where: { category: 'marketing-playbook', status: CourseStatus.PUBLISHED },
      select: {
        id: true, slug: true, title: true, description: true, thumbnailUrl: true,
        price: true, isPremium: true, durationMins: true, totalLessons: true,
        enrollmentCount: true, rating: true, tags: true,
      },
      orderBy: { enrollmentCount: 'desc' },
    });

    if (!userId) return courses;

    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { userId, courseId: { in: courses.map((c) => c.id) } },
    });
    const enrolledIds = new Set(enrollments.map((e) => e.courseId));

    return courses.map((c) => ({ ...c, isEnrolled: enrolledIds.has(c.id) }));
  }

  async getAiToolsTraining(userId?: string) {
    const courses = await this.prisma.course.findMany({
      where: { category: 'ai-tools-training', status: CourseStatus.PUBLISHED },
      select: {
        id: true, slug: true, title: true, description: true, thumbnailUrl: true,
        price: true, isPremium: true, durationMins: true, totalLessons: true,
        enrollmentCount: true, rating: true, tags: true,
      },
      orderBy: { enrollmentCount: 'desc' },
    });

    if (!userId) return courses;

    const enrollments = await this.prisma.courseEnrollment.findMany({
      where: { userId, courseId: { in: courses.map((c) => c.id) } },
    });
    const enrolledIds = new Set(enrollments.map((e) => e.courseId));
    return courses.map((c) => ({ ...c, isEnrolled: enrolledIds.has(c.id) }));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HISTORY
  // ════════════════════════════════════════════════════════════════════════════

  async getMySessions(userId: string, params: { examType?: string; subject?: string; page?: number }) {
    const { examType, subject, page = 1 } = params;
    const limit = 20;

    const [sessions, total] = await Promise.all([
      this.prisma.cBTSession.findMany({
        where: {
          userId,
          status: CBTSessionStatus.COMPLETED,
          ...(examType ? { examType: examType as never } : {}),
          ...(subject ? { subject: { contains: subject, mode: 'insensitive' } } : {}),
        },
        orderBy: { completedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, examType: true, subject: true, score: true, percentage: true,
          totalQuestions: true, timeTakenSecs: true, completedAt: true,
        },
      }),
      this.prisma.cBTSession.count({
        where: { userId, status: CBTSessionStatus.COMPLETED },
      }),
    ]);

    return { sessions, meta: { total, page, totalPages: Math.ceil(total / limit) } };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  private async updateStudyStreak(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    userId: string,
    score: number,
    totalAnswered: number,
  ) {
    const streak = await tx.studyStreak.findUnique({ where: { userId } });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let newStreak = 1;
    let totalDays = 1;

    if (streak?.lastStudiedAt) {
      const lastDate = new Date(streak.lastStudiedAt);
      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
      const diffDays = Math.floor((today.getTime() - lastDay.getTime()) / 86400000);

      if (diffDays === 0) {
        // Same day — don't increment streak
        newStreak = streak.currentStreak;
        totalDays = streak.totalDaysStudied;
      } else if (diffDays === 1) {
        // Consecutive day — extend streak
        newStreak = streak.currentStreak + 1;
        totalDays = streak.totalDaysStudied + 1;
      } else {
        // Streak broken
        newStreak = 1;
        totalDays = streak.totalDaysStudied + 1;
      }
    }

    const xpGain = score * XP_PER_CORRECT + XP_PER_SESSION;
    const newXp = (streak?.xpPoints ?? 0) + xpGain;
    const newLevel = this.calculateLevel(newXp);

    await tx.studyStreak.upsert({
      where: { userId },
      update: {
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, streak?.longestStreak ?? 0),
        totalDaysStudied: totalDays,
        lastStudiedAt: now,
        xpPoints: newXp,
        level: newLevel,
        totalSessionsDone: { increment: 1 },
        totalQuestionsAnswered: { increment: totalAnswered },
        totalCorrect: { increment: score },
      },
      create: {
        userId,
        currentStreak: 1,
        longestStreak: 1,
        totalDaysStudied: 1,
        lastStudiedAt: now,
        xpPoints: xpGain,
        level: 1,
        totalSessionsDone: 1,
        totalQuestionsAnswered: totalAnswered,
        totalCorrect: score,
      },
    });
  }

  private async upsertSubjectPerformance(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    userId: string,
    examType: string,
    subject: string,
    stats: { correct: number; total: number },
  ) {
    const existing = await tx.subjectPerformance.findUnique({
      where: { userId_examType_subject: { userId, examType: examType as never, subject } },
    });

    const totalAttempted = (existing?.totalAttempted ?? 0) + stats.total;
    const totalCorrect = (existing?.totalCorrect ?? 0) + stats.correct;
    const averagePercent = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0;

    await tx.subjectPerformance.upsert({
      where: { userId_examType_subject: { userId, examType: examType as never, subject } },
      update: { totalAttempted, totalCorrect, averagePercent, lastAttemptAt: new Date() },
      create: { userId, examType: examType as never, subject, totalAttempted, totalCorrect, averagePercent, lastAttemptAt: new Date() },
    });
  }

  private calculateLevel(xp: number): number {
    for (let i = LEVEL_XP_THRESHOLDS.length - 1; i >= 0; i--) {
      if (xp >= LEVEL_XP_THRESHOLDS[i]) return i + 1;
    }
    return 1;
  }

  private getNextLevelXp(level: number): number {
    return LEVEL_XP_THRESHOLDS[Math.min(level, LEVEL_XP_THRESHOLDS.length - 1)] ?? 99999;
  }

  private getXpProgress(level: number, xp: number): number {
    const current = LEVEL_XP_THRESHOLDS[level - 1] ?? 0;
    const next = this.getNextLevelXp(level);
    if (next === 99999) return 100;
    return Math.round(((xp - current) / (next - current)) * 100);
  }

  private calculateGrade(percentage: number): string {
    if (percentage >= 70) return 'A';
    if (percentage >= 60) return 'B';
    if (percentage >= 50) return 'C';
    if (percentage >= 45) return 'D';
    return 'F';
  }

  private getQuestionCount(examType: string, mode?: string): number {
    if (mode === 'practice') return 20;
    if (mode === 'quick') return 10;
    const counts: Record<string, number> = { JAMB: 40, WAEC: 50, NECO: 50, GCE: 50, POST_UTME: 30 };
    return counts[examType] ?? 40;
  }

  private getTimeLimit(examType: string, mode?: string): number {
    if (mode === 'practice') return 1200; // 20 mins
    if (mode === 'quick') return 600;     // 10 mins
    const limits: Record<string, number> = {
      JAMB: 1800,    // 30 mins per subject
      WAEC: 3000,    // 50 mins
      NECO: 3000,
      GCE: 3000,
      POST_UTME: 1800,
    };
    return limits[examType] ?? 1800;
  }

  private getScopeDate(scope: 'global' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    if (scope === 'weekly') {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    if (scope === 'monthly') {
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    return new Date(0); // epoch = all time
  }

  private async generateCourseSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60);

    let slug = base;
    let i = 1;
    while (await this.prisma.course.findUnique({ where: { slug } })) {
      slug = `${base}-${i++}`;
    }
    return slug;
  }
}