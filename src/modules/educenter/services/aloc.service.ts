// ═══════════════════════════════════════════════════════════════════════════════
// service/src/modules/educenter/services/aloc.service.ts
//
// ALOC API Integration — https://questions.aloc.com.ng
// Questions are NEVER stored in our DB. Fetched at runtime + cached in Redis.
// ═══════════════════════════════════════════════════════════════════════════════

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../database/redis.service';

// ─── ALOC API Types ───────────────────────────────────────────────────────────

export interface AlocOption {
    a: string;
    b: string;
    c: string;
    d: string;
}

export interface AlocQuestion {
    id: number;
    question: string;
    option: AlocOption;
    answer: string;         // "a" | "b" | "c" | "d"
    solution?: string;      // explanation (may be null)
    image?: string | null;
    subject: string;
    year?: number | null;
    examtype?: string;
}

export interface AlocSubjectResponse {
    status: boolean;
    message: string;
    data: AlocQuestion[];
    availableYears?: number[];
}

export interface AlocQuestionResponse {
    status: boolean;
    message: string;
    data: AlocQuestion;
}

export interface AlocSubjectsResponse {
    status: boolean;
    message: string;
    data: string[];
}

// Normalized to our internal format
export interface NormalizedQuestion {
    alocId: string;
    question: string;
    options: { A: string; B: string; C: string; D: string };
    answer: string;          // "A" | "B" | "C" | "D" (uppercase)
    explanation: string | null;
    imageUrl: string | null;
    subject: string;
    year: number | null;
    examType: string;
}

// ─── Exam/Subject maps ────────────────────────────────────────────────────────

export const ALOC_EXAM_MAP: Record<string, string> = {
    JAMB: 'utme',
    WAEC: 'waec',
    NECO: 'neco',
    GCE: 'waec-november',
    POST_UTME: 'post-utme',
};

export const JAMB_SUBJECTS = [
    'Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology',
    'Economics', 'Government', 'Literature in English', 'Geography',
    'Agricultural Science', 'Commerce', 'Accounting', 'Christian Religious Studies',
    'Islamic Religious Studies', 'Yoruba', 'Igbo', 'Hausa', 'History',
    'Civic Education', 'Computer Studies',
];

export const WAEC_SUBJECTS = [
    ...JAMB_SUBJECTS,
    'Further Mathematics', 'Technical Drawing', 'Food and Nutrition',
    'Health Science', 'Home Economics',
];

@Injectable()
export class AlocService {
    private readonly logger = new Logger(AlocService.name);
    private readonly baseUrl: string;
    private readonly apiToken: string;
    private readonly CACHE_TTL = 3600; // 1 hour
    private readonly SUBJECTS_CACHE_TTL = 86400; // 24 hours

    constructor(
        private readonly config: ConfigService,
        private readonly redis: RedisService,
    ) {
        this.baseUrl = 'https://questions.aloc.com.ng/api/v2';
        this.apiToken = this.config.getOrThrow<string>('ALOC_API_TOKEN');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // FETCH QUESTIONS FOR CBT SESSION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Fetch N questions for a CBT session.
     * Cached by exam+subject+year key to avoid hammering ALOC API.
     * For JAMB: 40 questions per subject, 4 subjects = 160 total
     * For WAEC: 50 questions per subject
     */
    async fetchQuestionsForSession(params: {
        examType: string;
        subject: string;
        year?: number;
        limit?: number;
    }): Promise<NormalizedQuestion[]> {
        const { examType, subject, year, limit = 40 } = params;
        const alocExam = ALOC_EXAM_MAP[examType] ?? 'utme';

        const cacheKey = `aloc:questions:${alocExam}:${subject.toLowerCase().replace(/\s+/g, '-')}:${year ?? 'random'}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
            const all = JSON.parse(cached) as NormalizedQuestion[];
            return this.shuffleAndSlice(all, limit);
        }

        try {
            const url = this.buildUrl('/q', { subject, type: alocExam, ...(year ? { year } : {}) });
            const response = await this.fetchWithRetry<AlocSubjectResponse>(url);

            if (!response.status || !Array.isArray(response.data)) {
                throw new ServiceUnavailableException('ALOC API returned invalid response');
            }

            const normalized = response.data.map((q) => this.normalize(q, examType));

            // Cache the full set, return requested slice
            await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(normalized));
            return this.shuffleAndSlice(normalized, limit);
        } catch (err) {
            this.logger.error(`ALOC fetch failed for ${examType}/${subject}`, err);
            throw new ServiceUnavailableException(
                'Question bank is temporarily unavailable. Please try again in a moment.',
            );
        }
    }

    /**
     * Fetch multiple subjects for a full JAMB mock exam (4 subjects × 40 = 160 questions).
     */
    async fetchMultiSubjectExam(params: {
        examType: string;
        subjects: string[];        // e.g. ["Mathematics", "English Language", "Physics", "Chemistry"]
        questionsPerSubject?: number;
        year?: number;
    }): Promise<Record<string, NormalizedQuestion[]>> {
        const { subjects, questionsPerSubject = 40 } = params;

        const results = await Promise.allSettled(
            subjects.map((subject) =>
                this.fetchQuestionsForSession({
                    examType: params.examType,
                    subject,
                    year: params.year,
                    limit: questionsPerSubject,
                }),
            ),
        );

        const bySubject: Record<string, NormalizedQuestion[]> = {};
        for (let i = 0; i < subjects.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled') {
                bySubject[subjects[i]] = result.value;
            } else {
                this.logger.warn(`Failed to fetch ${subjects[i]}: ${String(result.reason)}`);
                bySubject[subjects[i]] = [];
            }
        }

        return bySubject;
    }

    /**
     * Fetch a single question by ALOC ID (for review mode).
     */
    async fetchQuestionById(alocId: string | number): Promise<NormalizedQuestion | null> {
        const cacheKey = `aloc:q:${alocId}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as NormalizedQuestion;

        try {
            const url = this.buildUrl(`/q/${alocId}`, {});
            const response = await this.fetchWithRetry<AlocQuestionResponse>(url);

            if (!response.status || !response.data) return null;

            const normalized = this.normalize(response.data, response.data.examtype ?? 'JAMB');
            await this.redis.setex(cacheKey, this.CACHE_TTL * 24, JSON.stringify(normalized));
            return normalized;
        } catch {
            return null;
        }
    }

    /**
     * Get available subjects for an exam type.
     */
    async getSubjectsForExam(examType: string): Promise<string[]> {
        const cacheKey = `aloc:subjects:${examType}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as string[];

        // Return our curated list (ALOC has no /subjects endpoint)
        const subjects = examType === 'WAEC' || examType === 'NECO' ? WAEC_SUBJECTS : JAMB_SUBJECTS;
        await this.redis.setex(cacheKey, this.SUBJECTS_CACHE_TTL, JSON.stringify(subjects));
        return subjects;
    }

    /**
     * Get available years for a subject (uses ALOC meta endpoint).
     */
    async getAvailableYears(examType: string, subject: string): Promise<number[]> {
        const alocExam = ALOC_EXAM_MAP[examType] ?? 'utme';
        const cacheKey = `aloc:years:${alocExam}:${subject}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as number[];

        // Standard available years range — ALOC covers 2000-2023 for most subjects
        const years = Array.from({ length: 24 }, (_, i) => 2023 - i); // 2023 → 2000
        await this.redis.setex(cacheKey, this.SUBJECTS_CACHE_TTL, JSON.stringify(years));
        return years;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ──────────────────────────────────────────────────────────────────────────

    private normalize(q: AlocQuestion, examType: string): NormalizedQuestion {
        const answerMap: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' };
        return {
            alocId: String(q.id),
            question: q.question ?? '',
            options: {
                A: q.option?.a ?? '',
                B: q.option?.b ?? '',
                C: q.option?.c ?? '',
                D: q.option?.d ?? '',
            },
            answer: answerMap[q.answer?.toLowerCase()] ?? 'A',
            explanation: q.solution ?? null,
            imageUrl: q.image ?? null,
            subject: q.subject ?? '',
            year: q.year ?? null,
            examType: examType.toUpperCase(),
        };
    }

    private buildUrl(path: string, params: Record<string, string | number | undefined>): string {
        const url = new URL(`${this.baseUrl}${path}`);
        url.searchParams.set('token', this.apiToken);
        for (const [key, val] of Object.entries(params)) {
            if (val !== undefined) url.searchParams.set(key, String(val));
        }
        return url.toString();
    }

    private async fetchWithRetry<T>(url: string, retries = 3): Promise<T> {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, {
                    headers: {
                        'Accept': 'application/json',
                        'AccessToken': this.apiToken,
                    },
                    signal: AbortSignal.timeout(10_000), // 10s timeout
                });

                if (!res.ok) {
                    throw new Error(`ALOC API error: ${res.status} ${res.statusText}`);
                }

                return res.json() as Promise<T>;
            } catch (err) {
                if (attempt === retries) throw err;
                this.logger.warn(`ALOC retry ${attempt}/${retries}: ${String(err)}`);
                await new Promise((r) => setTimeout(r, 500 * attempt)); // Backoff
            }
        }
        throw new Error('Max retries exceeded');
    }

    private shuffleAndSlice<T>(arr: T[], limit: number): T[] {
        const shuffled = [...arr].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, Math.min(limit, shuffled.length));
    }
}