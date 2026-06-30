
import {
    Controller, Get, Post, Patch, Delete, Body, Param, Query,
    UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { EduCenterService } from './educenter.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import {
    StartCbtDto, StartFullMockDto, SubmitSessionDto,
    GetQuestionsDto, AiTutorDto, StudyPlanDto,
    CreateCourseDto, UpdateProgressDto, WeeklyGoalDto,
} from './dto/educenter.dto';

// JWT payload shape from auth module
interface JwtUser { sub: string; role: string; }

@UseGuards(JwtAuthGuard)
@Controller('educenter')
export class EduCenterController {
    constructor(private readonly eduService: EduCenterService) { }

    // ── Exam Meta ──────────────────────────────────────────────────────────────

    @Public()
    @Get('subjects/:examType')
    getSubjects(@Param('examType') examType: string) {
        return this.eduService.getSubjectsForExam(examType);
    }

    // ── Questions Preview (for browsing, no session) ───────────────────────────

    @Public()
    @Get('questions/preview')
    previewQuestions(@Query() dto: GetQuestionsDto) {
        // Returns 5 sample questions (stripped of answers) for marketing/preview
        return this.eduService['aloc'].fetchQuestionsForSession({
            examType: dto.examType,
            subject: dto.subject,
            year: dto.year,
            limit: 5,
        }).then((qs) =>
            qs.map((q) => ({
                alocId: q.alocId,
                question: q.question,
                options: q.options,
                subject: q.subject,
                year: q.year,
                // Never expose answer in preview
            })),
        );
    }

    // ── CBT Session ────────────────────────────────────────────────────────────

    @Post('cbt/start')
    startSession(@CurrentUser() user: JwtUser, @Body() dto: StartCbtDto) {
        return this.eduService.startCbtSession(user.sub, dto);
    }

    @Post('cbt/mock')
    startFullMock(@CurrentUser() user: JwtUser, @Body() dto: StartFullMockDto) {
        return this.eduService.startFullMockExam(user.sub, dto);
    }

    @Post('cbt/:sessionId/submit')
    @HttpCode(HttpStatus.OK)
    submitSession(
        @CurrentUser() user: JwtUser,
        @Param('sessionId') sessionId: string,
        @Body() dto: SubmitSessionDto,
    ) {
        return this.eduService.submitSession(user.sub, sessionId, dto);
    }

    @Post('cbt/:sessionId/abandon')
    @HttpCode(HttpStatus.OK)
    abandonSession(
        @CurrentUser() user: JwtUser,
        @Param('sessionId') sessionId: string,
    ) {
        return this.eduService.abandonSession(user.sub, sessionId);
    }

    @Get('cbt/:sessionId/review')
    getSessionReview(@CurrentUser() user: JwtUser, @Param('sessionId') sessionId: string) {
        return this.eduService.getSessionReview(user.sub, sessionId);
    }

    // ── History ────────────────────────────────────────────────────────────────

    @Get('sessions')
    getMySessions(
        @CurrentUser() user: JwtUser,
        @Query('examType') examType?: string,
        @Query('subject') subject?: string,
        @Query('page') page?: string,
    ) {
        return this.eduService.getMySessions(user.sub, { examType, subject, page: page ? +page : 1 });
    }

    // ── Dashboard & Analytics ──────────────────────────────────────────────────

    @Get('dashboard')
    getDashboard(@CurrentUser() user: JwtUser) {
        return this.eduService.getStudentDashboard(user.sub);
    }

    @Get('analytics/:examType/:subject')
    getSubjectAnalytics(
        @CurrentUser() user: JwtUser,
        @Param('examType') examType: string,
        @Param('subject') subject: string,
    ) {
        return this.eduService.getSubjectAnalytics(user.sub, examType, subject);
    }

    // ── Study Streak ───────────────────────────────────────────────────────────

    @Get('streak')
    getStreak(@CurrentUser() user: JwtUser) {
        return this.eduService.getMyStreak(user.sub);
    }

    @Patch('streak/goal')
    updateWeeklyGoal(@CurrentUser() user: JwtUser, @Body() dto: WeeklyGoalDto) {
        return this.eduService.updateWeeklyGoal(user.sub, dto.goalDays);
    }

    // ── Leaderboard ────────────────────────────────────────────────────────────

    @Public()
    @Get('leaderboard')
    getLeaderboard(
        @Query('scope') scope: string = 'weekly',
        @Query('examType') examType?: string,
        @Query('limit') limit?: string,
    ) {
        return this.eduService.getLeaderboard({
            scope: (scope as 'global' | 'weekly' | 'monthly') ?? 'weekly',
            examType,
            limit: limit ? +limit : 50,
        });
    }

    @Get('leaderboard/my-rank')
    getMyRank(
        @CurrentUser() user: JwtUser,
        @Query('scope') scope: string = 'weekly',
    ) {
        return this.eduService.getMyRank(user.sub, (scope as 'global' | 'weekly' | 'monthly') ?? 'weekly');
    }

    // ── AI Tutor ───────────────────────────────────────────────────────────────

    @Post('ai-tutor')
    askTutor(@CurrentUser() user: JwtUser, @Body() dto: AiTutorDto) {
        return this.eduService.askAiTutor(user.sub, dto);
    }

    @Post('study-plan')
    generateStudyPlan(@CurrentUser() user: JwtUser, @Body() dto: StudyPlanDto) {
        return this.eduService.generateStudyPlan(user.sub, dto);
    }

    // ── Course Library ─────────────────────────────────────────────────────────

    @Public()
    @Get('courses')
    listCourses(
        @Query('category') category?: string,
        @Query('examType') examType?: string,
        @Query('subject') subject?: string,
        @Query('isPremium') isPremium?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
    ) {
        return this.eduService.listCourses({
            category,
            examType,
            subject,
            isPremium: isPremium === 'true' ? true : isPremium === 'false' ? false : undefined,
            search,
            page: page ? +page : 1,
        });
    }

    @Public()
    @Get('courses/:slug')
    getCourse(@Param('slug') slug: string, @CurrentUser() user?: JwtUser) {
        return this.eduService.getCourseBySlug(slug, user?.sub);
    }

    @Post('courses/:courseId/enroll')
    @HttpCode(HttpStatus.OK)
    enrollCourse(@CurrentUser() user: JwtUser, @Param('courseId') courseId: string) {
        return this.eduService.enrollCourse(user.sub, courseId);
    }

    @Patch('courses/:courseId/progress')
    updateProgress(
        @CurrentUser() user: JwtUser,
        @Param('courseId') courseId: string,
        @Body() dto: UpdateProgressDto,
    ) {
        return this.eduService.updateCourseProgress(user.sub, courseId, dto);
    }

    @Get('courses/marketing-playbooks')
    getMarketingPlaybooks(@CurrentUser() user?: JwtUser) {
        return this.eduService.getMarketingPlaybooks(user?.sub);
    }

    @Get('courses/ai-tools-training')
    getAiToolsTraining(@CurrentUser() user?: JwtUser) {
        return this.eduService.getAiToolsTraining(user?.sub);
    }

    // ── Instructor/Admin Routes ────────────────────────────────────────────────

    @UseGuards(RolesGuard)
    @Roles('admin', 'super_admin', 'editor', 'creator')
    @Post('courses')
    createCourse(@CurrentUser() user: JwtUser, @Body() dto: CreateCourseDto) {
        return this.eduService.createCourse(user.sub, dto);
    }

    @UseGuards(RolesGuard)
    @Roles('admin', 'super_admin', 'editor', 'creator')
    @Patch('courses/:courseId/publish')
    publishCourse(@CurrentUser() user: JwtUser, @Param('courseId') courseId: string) {
        return this.eduService.publishCourse(courseId, user.sub);
    }
}