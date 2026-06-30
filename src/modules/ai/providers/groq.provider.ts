
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

export type GroqModel =
    | 'llama-3.3-70b-versatile'    // Best quality, 128k ctx — for business plans, EduCenter
    | 'llama-3.1-8b-instant'       // Fastest, 128k ctx — for receptionist, quick replies
    | 'gemma2-9b-it'               // Google's Gemma 2 — good at structured output
    | 'mixtral-8x7b-32768'         // 32k ctx, mix of experts
    | 'llama-guard-3-8b';          // Content moderation

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface GroqChatOptions {
    model?: GroqModel;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    messages?: GroqMessage[];  // For multi-turn conversations
    stopSequences?: string[];
}

export interface GroqResponse {
    content: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
}

@Injectable()
export class GroqProvider {
    private readonly logger = new Logger(GroqProvider.name);
    private readonly client: Groq;
    private readonly isAvailable: boolean;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('GROQ_API_KEY');
        this.isAvailable = !!apiKey;
        if (this.isAvailable) {
            this.client = new Groq({ apiKey });
            this.logger.log('✅ Groq provider initialized (FREE tier — 6k RPM)');
        } else {
            this.logger.warn('⚠️  GROQ_API_KEY not set — Groq provider unavailable');
        }
    }

    get available(): boolean {
        return this.isAvailable;
    }

    async chat(
        systemPrompt: string,
        userMessage: string,
        options: GroqChatOptions = {},
    ): Promise<GroqResponse> {
        const {
            model = 'llama-3.3-70b-versatile',
            temperature = 0.7,
            maxTokens = 2048,
            jsonMode = false,
            stopSequences,
        } = options;

        const start = Date.now();

        const completion = await this.client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature,
            max_tokens: maxTokens,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
            ...(stopSequences ? { stop: stopSequences } : {}),
        });

        const choice = completion.choices[0];
        return {
            content: choice?.message?.content ?? '',
            model: completion.model,
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
            latencyMs: Date.now() - start,
        };
    }

    /**
     * Multi-turn conversation (for AI Receptionist, EduBot tutor sessions)
     */
    async converse(messages: GroqMessage[], options: GroqChatOptions = {}): Promise<GroqResponse> {
        const {
            model = 'llama-3.1-8b-instant', // Fast model for conversation
            temperature = 0.8,
            maxTokens = 1024,
            jsonMode = false,
        } = options;

        const start = Date.now();

        const completion = await this.client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        });

        const choice = completion.choices[0];
        return {
            content: choice?.message?.content ?? '',
            model: completion.model,
            promptTokens: completion.usage?.prompt_tokens ?? 0,
            completionTokens: completion.usage?.completion_tokens ?? 0,
            totalTokens: completion.usage?.total_tokens ?? 0,
            latencyMs: Date.now() - start,
        };
    }

    /**
     * Content moderation using Llama Guard (FREE, built into Groq)
     */
    async moderateContent(content: string): Promise<{ safe: boolean; category?: string }> {
        try {
            const result = await this.client.chat.completions.create({
                model: 'llama-guard-3-8b',
                messages: [{ role: 'user', content }],
                max_tokens: 50,
            });
            const response = result.choices[0]?.message?.content?.toLowerCase() ?? '';
            const safe = response.startsWith('safe');
            const category = safe ? undefined : response.split('\n')[1]?.trim();
            return { safe, category };
        } catch {
            return { safe: true }; // Fail open
        }
    }

    /**
     * Streaming for real-time responses (EduBot, Receptionist)
     */
    async *stream(
        systemPrompt: string,
        userMessage: string,
        options: Omit<GroqChatOptions, 'jsonMode'> = {},
    ): AsyncGenerator<string> {
        const { model = 'llama-3.1-8b-instant', temperature = 0.7, maxTokens = 1024 } = options;

        const stream = await this.client.chat.completions.create({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            temperature,
            max_tokens: maxTokens,
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) yield delta;
        }
    }
}