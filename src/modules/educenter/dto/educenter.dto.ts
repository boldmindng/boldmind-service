
import {
    IsString, IsOptional, IsInt, IsIn, IsArray, IsBoolean,
    IsNumber, Min, Max, IsDateString, ArrayMinSize, ArrayMaxSize,
    ValidateNested, IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const EXAM_TYPES = ['JAMB', 'WAEC', 'NECO', 'GCE', 'POST_UTME', 'SKILL_TEST'];
const CBT_MODES = ['full', 'practice', 'quick'];
const LEADERBOARD_SCOPES = ['global', 'weekly', 'monthly'];

export class StartCbtDto {
    @IsIn(EXAM_TYPES) examType: string;
    @IsString() subject: string;
    @IsOptional() @IsInt() @Min(2000) @Max(2025) year?: number;
    @IsOptional() @IsIn(CBT_MODES) mode?: 'full' | 'practice' | 'quick';
}

export class StartFullMockDto {
    @IsIn(EXAM_TYPES) examType: string;

    @IsArray() @ArrayMinSize(2) @ArrayMaxSize(4)
    @IsString({ each: true })
    subjects: string[];

    @IsOptional() @IsInt() @Min(2000) @Max(2025) year?: number;
}

export class AnswerDto {
    @IsString() alocId: string;
    @IsIn(['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']) selectedAnswer: string;
    @IsOptional() @IsString() subject?: string;
    @IsOptional() @IsInt() @Min(0) timeTakenSecs?: number;
    @IsOptional() @IsBoolean() isSkipped?: boolean;
}

export class SubmitSessionDto {
    @IsArray() @ValidateNested({ each: true }) @Type(() => AnswerDto)
    answers: AnswerDto[];
    @IsOptional() @IsInt() @Min(0) timeTakenSecs?: number;
}

export class SubmitAnswerDto {
    @IsString() alocId: string;
    @IsIn(['A', 'B', 'C', 'D']) selectedAnswer: string;
    @IsOptional() @IsInt() timeTakenSecs?: number;
}

export class GetQuestionsDto {
    @IsIn(EXAM_TYPES) examType: string;
    @IsString() subject: string;
    @IsOptional() @IsInt() @Min(2000) @Max(2025) year?: number;
    @IsOptional() @IsInt() @Min(5) @Max(100) limit?: number;
}

export class AiTutorDto {
    @IsString() question: string;
    @IsString() subject: string;
    @IsIn(EXAM_TYPES) examType: string;
    @IsOptional() @IsString() context?: string;
}

export class StudyPlanDto {
    @IsIn(EXAM_TYPES) examType: string;

    @IsArray() @ArrayMinSize(1) @IsString({ each: true })
    subjects: string[];

    @IsDateString() targetDate: string;

    @IsInt() @Min(1) @Max(12) studyHoursPerDay: number;
}

export class CreateCourseDto {
    @IsString() title: string;
    @IsString() description: string;

    @IsIn(['exam-prep', 'marketing-playbook', 'ai-tools-training', 'digital-skills', 'entrepreneurship', 'general'])
    category: string;

    @IsOptional() @IsIn([...EXAM_TYPES, null]) examType?: string;
    @IsOptional() @IsString() subject?: string;
    @IsOptional() @IsString() thumbnailUrl?: string;
    @IsOptional() @IsString() videoUrl?: string;
    @IsOptional() @IsInt() @Min(0) durationMins?: number;
    @IsOptional() @IsInt() @Min(0) price?: number; // Kobo
    @IsOptional() @IsString() instructorName?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
    @IsOptional() @IsArray() @IsString({ each: true }) prerequisites?: string[];
}

export class UpdateCourseDto {
    @IsOptional() @IsString() title?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() thumbnailUrl?: string;
    @IsOptional() @IsInt() @Min(0) price?: number;
    @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class EnrollCourseDto {
    @IsString() courseId: string;
}

export class UpdateProgressDto {
    @IsOptional() @IsInt() @Min(0) completedLessons?: number;
    @IsOptional() @IsNumber() @Min(0) @Max(100) progressPercent?: number;
    @IsOptional() @IsString() lastLessonId?: string;
}

export class WeeklyGoalDto {
    @IsInt() @Min(1) @Max(7) goalDays: number;
}
