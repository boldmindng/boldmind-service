

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type OpenAIModel =
    | 'gpt-4o'                    // Best quality, most expensive
    | 'gpt-4o-mini'               // Good quality, cheap ($0.15/1M input tokens)
    | 'o1-mini'                   // Reasoning model
    | 'gpt-3.5-turbo';            // Legacy, cheapest

export interface OpenAIChatOptions {
    model?: OpenAIModel;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    systemPrompt?: string;
}

export interface OpenAIResponse {
    content: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    estimatedCostUsd: number;
}

// Cost per 1M tokens (input / output) in USD — for budget tracking
const COST_PER_1M: Record<string, [number, number]> = {
    'gpt-4o': [5.00, 15.00],
    'gpt-4o-mini': [0.15, 0.60],
    'gpt-3.5-turbo': [0.50, 1.50],
    'o1-mini': [3.00, 12.00],
};

@Injectable()
export class OpenAIProvider {
    private readonly logger = new Logger(OpenAIProvider.name);
    private readonly client: OpenAI;
    private readonly isAvailable: boolean;
    private totalSpendUsd = 0; // Runtime spend tracker

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('OPENAI_API_KEY');
        this.isAvailable = !!apiKey;
        if (this.isAvailable) {
            this.client = new OpenAI({ apiKey });
            this.logger.log('✅ OpenAI provider initialized');
        } else {
            this.logger.warn('⚠️  OPENAI_API_KEY not set — OpenAI provider unavailable');
        }
    }

    get available(): boolean {
        return this.isAvailable;
    }

    get estimatedTotalSpend(): number {
        return this.totalSpendUsd;
    }

    async chat(
        systemPrompt: string,
        userMessage: string,
        options: OpenAIChatOptions = {},
    ): Promise<OpenAIResponse> {
        const {
            model = 'gpt-4o-mini',  // Default to mini to save costs
            temperature = 0.7,
            maxTokens = 2048,
            jsonMode = false,
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
        });

        const usage = completion.usage;
        const costPer1M = COST_PER_1M[model] ?? [1, 1];
        const estimatedCostUsd =
            ((usage?.prompt_tokens ?? 0) * costPer1M[0] +
                (usage?.completion_tokens ?? 0) * costPer1M[1]) /
            1_000_000;

        this.totalSpendUsd += estimatedCostUsd;

        if (estimatedCostUsd > 0.01) {
            this.logger.debug(`OpenAI cost: $${estimatedCostUsd.toFixed(4)} (${model})`);
        }

        return {
            content: completion.choices[0]?.message?.content ?? '',
            model,
            promptTokens: usage?.prompt_tokens ?? 0,
            completionTokens: usage?.completion_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0,
            latencyMs: Date.now() - start,
            estimatedCostUsd,
        };
    }

    /**
     * Audio transcription via Whisper (no free alternative for quality)
     */
    async transcribeAudio(audioFile: File | Buffer | Uint8Array): Promise<string> {
        let file: File;
        if (audioFile instanceof File) {
            file = audioFile;
        } else {
            file = new File([audioFile as unknown as BlobPart], 'audio.mp3', { type: 'audio/mpeg' });
        }

        const transcription = await this.client.audio.transcriptions.create({
            file,
            model: 'whisper-1',
        });
        return transcription.text;
    }

    /**
     * Text-to-speech via OpenAI TTS (alloy/nova/shimmer voices)
     * Alternative: gTTS (free), but quality is much worse
     */
    async textToSpeech(
        text: string,
        voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
    ): Promise<Buffer> {
        const mp3 = await this.client.audio.speech.create({
            model: 'tts-1',
            voice,
            input: text,
        });
        return Buffer.from(await mp3.arrayBuffer());
    }

    /**
     * DALL-E 3 image generation (fallback when fal.ai is down)
     */
    async generateImage(
        prompt: string,
        size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024',
    ): Promise<string> {
        const response = await this.client.images.generate({
            model: 'dall-e-3',
            prompt,
            n: 1,
            size,
            quality: 'standard',
        });
        const url = response.data?.[0]?.url;
        if (!url) throw new Error('DALL-E failed to generate image');
        return url;
    }

    /**
     * Embeddings (text-embedding-3-small — cheapest, good quality)
     */
    async embed(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0]!.embedding;
    }
}