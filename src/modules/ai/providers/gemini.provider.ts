
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
    GenerationConfig,
} from '@google/generative-ai';

export type GeminiModel =
    | 'gemini-2.5-flash'
    | 'gemini-2.0-flash'          // Best balance — free, fast, multimodal
    | 'gemini-1.5-pro'            // Best quality — free 2 RPM, 1M ctx
    | 'gemini-1.5-flash'          // Fast, free 15 RPM, 1M ctx
    | 'gemini-1.5-flash-8b'       // Fastest, free 15 RPM
    | 'gemma-3-27b-it'            // Gemma 3 working model
    | 'gemini-flash-latest';

export interface GeminiOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
    systemInstruction?: string;
    // Gemini 2.0 Flash supports Google Search grounding (free!)
    useGoogleSearch?: boolean;
}

export interface GeminiResponse {
    content: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    latencyMs: number;
    groundingMetadata?: unknown;
}

// Safety settings — allow Nigerian content (news, business, cultural discussions)
const SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

@Injectable()
export class GeminiProvider {
    private readonly logger = new Logger(GeminiProvider.name);
    private readonly client: GoogleGenerativeAI;
    private readonly isAvailable: boolean;

    constructor(private readonly config: ConfigService) {
        const apiKey = this.config.get<string>('GEMINI_API_KEY');
        this.isAvailable = !!apiKey;
        if (this.isAvailable) {
            this.client = new GoogleGenerativeAI(apiKey!);
            this.logger.log('✅ Gemini provider initialized (FREE tier — 1M ctx, 15 RPM)');
        } else {
            this.logger.warn('⚠️  GEMINI_API_KEY not set — Gemini provider unavailable');
        }
    }

    get available(): boolean {
        return this.isAvailable;
    }

    async chat(
        systemPrompt: string,
        userMessage: string,
        options: GeminiOptions = {},
    ): Promise<GeminiResponse> {
        const {
            model = 'gemini-2.5-flash',
            temperature = 0.7,
            maxTokens = 2048,
            jsonMode = false,
            useGoogleSearch = false,
        } = options;

        const start = Date.now();

        const generationConfig: GenerationConfig = {
            temperature,
            maxOutputTokens: maxTokens,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        };

        console.log(`🔍 Gemini: Preparing model [${model}]...`);
        const geminiModel = this.client.getGenerativeModel({
            model,
            systemInstruction: systemPrompt,
            generationConfig,
            safetySettings: SAFETY_SETTINGS,
            ...(useGoogleSearch
                ? {
                    tools: [
                        { googleSearchRetrieval: {} } as any,
                    ],
                }
                : {}),
        });
        console.log(`✅ Gemini: Model [${model}] initialized.`);

        console.log(`🤖 Gemini [${model}] calling generateContent... (System length: ${systemPrompt.length}, User length: ${userMessage.length})`);
        const result = await geminiModel.generateContent(userMessage);
        console.log(`✅ Gemini [${model}] response received.`);
        
        const response = result.response;
        const text = response.text();

        return {
            content: text,
            model,
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
            latencyMs: Date.now() - start,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata,
        };
    }

    /**
     * Multi-turn chat session (maintains history)
     */
    async startChatSession(systemPrompt: string, model: any = 'gemini-2.5-flash') {
        const geminiModel = this.client.getGenerativeModel({
            model,
            systemInstruction: systemPrompt,
            safetySettings: SAFETY_SETTINGS,
        });

        return geminiModel.startChat({ history: [] });
    }

    /**
     * Vision — analyze images (e.g. food photos for Naija-Fit meal logging)
     */
    async analyzeImage(
        imageBase64: string,
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
        prompt: string,
        systemPrompt?: string,
    ): Promise<GeminiResponse> {
        const start = Date.now();

        const model = this.client.getGenerativeModel({
            model: 'gemini-2.0-flash', // Free multimodal
            ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
            safetySettings: SAFETY_SETTINGS,
        });

        const result = await model.generateContent([
            { inlineData: { data: imageBase64, mimeType } },
            prompt,
        ]);

        const response = result.response;
        return {
            content: response.text(),
            model: 'gemini-2.0-flash',
            promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
            completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
            latencyMs: Date.now() - start,
        };
    }

    /**
     * Real-time trend search using Gemini 2.0 Flash Google Search grounding
     * FREE — no SerpAPI or Perplexity needed
     */
    async searchAndSummarize(query: string, systemContext?: string): Promise<GeminiResponse> {
        return this.chat(
            systemContext ?? 'You are a research assistant. Provide accurate, current information.',
            query,
            { model: 'gemini-2.0-flash', useGoogleSearch: true, temperature: 0.3 },
        );
    }

    /**
     * Embeddings via Gemini text-embedding-004 (FREE, 768 dimensions)
     * Better than OpenAI ada-002 at many tasks, totally free
     */
    async embed(text: string): Promise<number[]> {
        const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(text);
        return result.embedding.values;
    }

    async embedBatch(texts: string[]): Promise<number[][]> {
        const model = this.client.getGenerativeModel({ model: 'text-embedding-004' });
        const results = await Promise.all(texts.map((t) => model.embedContent(t)));
        return results.map((r) => r.embedding.values);
    }
}