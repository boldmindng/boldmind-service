import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { GroqProvider, GroqModel } from './providers/groq.provider';
import { GeminiProvider, GeminiModel } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { CloudflareAiProvider } from './providers/cloudflare.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { RedisService } from '../../database/redis.service';

// ─── Task type hints — for intelligent routing ────────────────────────────────

export type AiTask =
  | 'fast-chat'          // Receptionist replies, quick answers — use llama-3.1-8b-instant
  | 'reasoning'          // Business plans, financial analysis — use llama-3.3-70b / gpt-4o
  | 'creative'           // Articles, marketing copy, branding — use gemini-2.0-flash
  | 'nigerian-language'  // Pidgin/Yoruba/Igbo/Hausa content — use gemini (best non-English)
  | 'json-extraction'    // Structured JSON output — use groq (best json_mode support)
  | 'long-context'       // Docs, full codebases — use gemini-1.5-pro (1M ctx)
  | 'conversation'       // Multi-turn chat sessions — use groq llama-3.1-8b
  | 'code'               // Code generation — use groq (llama-3.3 or mixtral)
  | 'moderation';        // Content safety — use llama-guard via groq

export interface ChatOptions {
  task?: AiTask;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  cacheTtl?: number;   // Redis TTL in seconds (0 = no cache)
  forceProvider?: 'groq' | 'gemini' | 'openai' | 'ollama' | 'cloudflare';
  model?: string;      // Override model selection
  useWebSearch?: boolean; // Gemini Google Search grounding
}

export interface AiChatResult {
  content: string;
  provider: string;
  model: string;
  tokens: number;
  latencyMs: number;
  cached: boolean;
}

export interface AiImageResult {
  data: Buffer | null;
  url: string | null;
  provider: string;
}

// ─── Nigerian language prompting helpers ──────────────────────────────────────

const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  pidgin: `Write in Nigerian Pidgin English. Use authentic Lagos/Nigerian Pidgin phrases. 
           Mix in occasional Yoruba/Igbo greetings naturally. Be warm, energetic, and street-smart.
           Examples of tone: "E don do!", "No worry", "See finish", "Hustle hard my guy"`,
  yoruba: `Write in Yoruba language. Use proper Yoruba orthography including tone marks where needed.
           Be respectful and use appropriate Yoruba honorifics.`,
  igbo: `Write in standard Igbo. Use common Central Igbo dialect as widely understood.
         Be warm and community-oriented in tone.`,
  hausa: `Write in standard Hausa. Be respectful and use appropriate honorifics.
          Consider northern Nigerian business and cultural context.`,
  english: `Write in clear, professional Nigerian English. 
            Reference Nigerian context, examples, and currency (Naira) where relevant.`,
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly CACHE_TTL_DEFAULT = 3600; // 1 hour

  constructor(
    private readonly groq: GroqProvider,
    private readonly gemini: GeminiProvider,
    private readonly openai: OpenAIProvider,
    private readonly cloudflare: CloudflareAiProvider,
    private readonly ollama: OllamaProvider,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.logger.log('🧠 BoldMind AI Gateway initialized');
    this.logAvailableProviders();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIMARY: CHAT / TEXT GENERATION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Universal chat method — all modules use this.
   * Automatically routes to best provider, handles cache + fallbacks.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {},
  ): Promise<AiChatResult> {
    const { task = 'fast-chat', cacheTtl = this.CACHE_TTL_DEFAULT, forceProvider } = options;

    // ── Cache check ──────────────────────────────────────────────────────────
    if (cacheTtl > 0) {
      const cacheKey = this.buildCacheKey(systemPrompt, userMessage, options);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
    }

    // ── Route to best provider ───────────────────────────────────────────────
    const result = forceProvider
      ? await this.callSpecificProvider(forceProvider, systemPrompt, userMessage, options)
      : await this.routeByTask(task, systemPrompt, userMessage, options);

    // ── Cache result ─────────────────────────────────────────────────────────
    if (cacheTtl > 0 && result.content) {
      const cacheKey = this.buildCacheKey(systemPrompt, userMessage, options);
      await this.redis.setex(cacheKey, cacheTtl, JSON.stringify({ ...result, cached: false }));
    }

    return { ...result, cached: false };
  }

  /**
   * Generate structured JSON — with automatic retry if parse fails
   */
  async generateJson<T = Record<string, unknown>>(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {},
  ): Promise<{ content: T; provider: string; model: string; tokens?: number }> {
    const result = await this.chat(systemPrompt, userMessage, {
      ...options,
      task: options.task ?? 'json-extraction',
      jsonMode: true,
    });

    try {
      // Strip markdown code blocks if AI added them
      const cleaned = result.content
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      return { content: JSON.parse(cleaned) as T, provider: result.provider, model: result.model, tokens: result.tokens };
    } catch {
      // Retry once with explicit JSON instruction
      const retryResult = await this.chat(
        systemPrompt + '\n\nCRITICAL: Your response MUST be valid JSON only. No markdown, no explanations.',
        userMessage,
        { ...options, jsonMode: true, cacheTtl: 0 },
      );
      const cleaned = retryResult.content
        .replace(/^```(?:json)?\n?/m, '')
        .replace(/\n?```$/m, '')
        .trim();
      return { content: JSON.parse(cleaned) as T, provider: retryResult.provider, model: retryResult.model, tokens: retryResult.tokens };
    }
  }

  /**
   * Convenience wrapper for generateJson that returns only the content.
   */
  async structuredChat<T = Record<string, unknown>>(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {},
  ): Promise<T> {
    const result = await this.generateJson<T>(systemPrompt, userMessage, options);
    return result.content;
  }

  /**
   * Nigerian language content generation — automatically selects Gemini
   * which has the best support for Yoruba, Igbo, Hausa, Pidgin
   */
  async generateNigerianContent(
    task: string,
    language: 'pidgin' | 'english' | 'yoruba' | 'igbo' | 'hausa',
    basePrompt: string,
    options: ChatOptions = {},
  ): Promise<AiChatResult> {
    const languageInstruction = LANGUAGE_INSTRUCTIONS[language] ?? LANGUAGE_INSTRUCTIONS.english;
    const systemPrompt = `${task}\n\nLANGUAGE INSTRUCTIONS:\n${languageInstruction}`;

    return this.chat(systemPrompt, basePrompt, {
      task: 'nigerian-language',
      ...options,
      // Gemini is best for non-English African languages
      forceProvider: options.forceProvider ?? 'gemini',
    });
  }

  /**
   * Business-focused generation (PlanAI)
   * Routes to Groq 70B → Gemini Flash → GPT-4o-mini with Nigerian market context
   */
  async generateBusinessContent(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {},
  ): Promise<AiChatResult> {
    const nigeriaBizContext = `
IMPORTANT NIGERIAN MARKET CONTEXT:
- All monetary values in Naira (₦) and Kobo, not USD
- Reference Nigerian regulatory bodies: CAC (Corporate Affairs Commission), FIRS (tax), CBN (banking)
- Use SMEDAN, NITDA, NCC as relevant government bodies
- Payment: Paystack, Flutterwave, bank transfers (not Stripe, PayPal)
- Infrastructure context: NEPA/PHCN power issues, generator costs, internet data costs
- E-commerce: Jumia, Konga competitor landscape
- Popular platforms: WhatsApp Business, Instagram, TikTok for marketing
- Nigerian Startup Act 2022 for regulatory guidance
- Bank of Industry (BOI) loans, NIRSAL for agriculture finance`;

    return this.chat(systemPrompt + nigeriaBizContext, userMessage, {
      task: 'reasoning',
      ...options,
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // STREAMING (for real-time AI Receptionist + EduBot)
  // ════════════════════════════════════════════════════════════════════════════

  async *streamChat(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {},
  ): AsyncGenerator<string> {
    // Streaming only via Groq (fastest) or Gemini
    if (this.groq.available) {
      yield* this.groq.stream(systemPrompt, userMessage, {
        model: 'llama-3.1-8b-instant',
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 512,
      });
    } else if (this.gemini.available) {
      // Gemini streaming
      const model = this.gemini['client']
        .getGenerativeModel({ model: 'gemini-2.0-flash' });
      const chat = model.startChat();
      const result = await chat.sendMessageStream(userMessage);
      for await (const chunk of result.stream) {
        yield chunk.text();
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // IMAGE GENERATION
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Social media images, banners, WhatsApp flyers — FREE via CF Workers AI
   */
  async generateSocialImage(
    prompt: string,
    format: 'square' | 'portrait' | 'landscape' | 'whatsapp-flyer' = 'square',
  ): Promise<AiImageResult> {
    const dimensions = {
      square: { width: 1080, height: 1080 },
      portrait: { width: 1080, height: 1350 },
      landscape: { width: 1200, height: 630 },
      'whatsapp-flyer': { width: 1080, height: 1920 },
    }[format];

    try {
      if (this.cloudflare.cfAvailable) {
        const buffer = await this.cloudflare.generateImageCF(prompt, { ...dimensions, steps: 4 });
        return { data: buffer, url: null, provider: 'cloudflare-flux-schnell' };
      }
    } catch (err) {
      this.logger.warn(`CF image failed, trying fal.ai: ${String(err)}`);
    }

    try {
      if (this.cloudflare.falAvailable) {
        const sizeMap: Record<string, string> = {
          square: 'square_hd',
          portrait: 'portrait_4_3',
          landscape: 'landscape_16_9',
          'whatsapp-flyer': 'portrait_16_9',
        };
        const urls = await this.cloudflare.generateImageFal(prompt, 'fal-ai/flux/schnell', {
          imageSize: sizeMap[format] as never,
        });
        return { data: null, url: urls[0] ?? null, provider: 'fal-flux-schnell' };
      }
    } catch (err) {
      this.logger.warn(`fal.ai failed: ${String(err)}`);
    }

    if (this.openai.available) {
      const url = await this.openai.generateImage(prompt);
      return { data: null, url, provider: 'openai-dalle3' };
    }

    throw new Error('No image generation provider available');
  }

  /**
   * Logo generation — highest quality via fal.ai FLUX.1 Pro
   * Fallback: SDXL via CF (free but lower quality)
   */
  async generateLogo(params: {
    brandName: string;
    industry: string;
    style: string;
    colors: string[];
    additionalDetails?: string;
  }): Promise<AiImageResult> {
    const { brandName, industry, style, colors, additionalDetails } = params;
    const colorStr = colors.join(', ');

    const prompt = `Professional logo design for "${brandName}", a Nigerian ${industry} brand.
Style: ${style}. Color palette: ${colorStr}.
${additionalDetails ? `Additional details: ${additionalDetails}` : ''}
Clean vector-style logo, minimal, scalable, professional. White background.
High quality commercial logo design.`;

    try {
      if (this.cloudflare.falAvailable) {
        const urls = await this.cloudflare.generateImageFal(prompt, 'fal-ai/flux-pro', {
          imageSize: 'square_hd',
          numSteps: 25,
        });
        return { data: null, url: urls[0] ?? null, provider: 'fal-flux-pro' };
      }
    } catch (err) {
      this.logger.warn(`fal.ai logo gen failed: ${String(err)}`);
    }

    // Fallback: CF SDXL (free but lower quality)
    if (this.cloudflare.cfAvailable) {
      const buffer = await this.cloudflare.generateImageSDXL(prompt, { width: 1024, height: 1024, steps: 30 });
      return { data: buffer, url: null, provider: 'cloudflare-sdxl' };
    }

    if (this.openai.available) {
      const url = await this.openai.generateImage(prompt, '1024x1024');
      return { data: null, url, provider: 'openai-dalle3' };
    }

    throw new Error('No logo generation provider available');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EMBEDDINGS — for semantic search, course recommendations
  // ════════════════════════════════════════════════════════════════════════════

  async embed(text: string): Promise<number[]> {
    if (this.gemini.available) {
      return this.gemini.embed(text);
    }
    if (this.openai.available) {
      return this.openai.embed(text);
    }
    throw new Error('No embedding provider available');
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.gemini.available) {
      return this.gemini.embedBatch(texts);
    }
    // OpenAI batch
    return Promise.all(texts.map((t) => this.openai.embed(t)));
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AUDIO
  // ════════════════════════════════════════════════════════════════════════════

  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    // Try free CF Whisper first
    if (this.cloudflare.cfAvailable) {
      try {
        return await this.cloudflare.transcribeAudio(audioBuffer);
      } catch (err) {
        this.logger.warn(`CF Whisper failed: ${String(err)}`);
      }
    }
    // Paid OpenAI Whisper fallback
    if (this.openai.available) {
      return this.openai.transcribeAudio(audioBuffer);
    }
    throw new Error('No audio transcription provider available');
  }

  async textToSpeech(
    text: string,
    voice: 'alloy' | 'nova' | 'shimmer' = 'nova',
  ): Promise<Buffer> {
    if (this.openai.available) {
      return this.openai.textToSpeech(text, voice);
    }
    throw new Error('TTS requires OpenAI API key');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CONTENT MODERATION
  // ════════════════════════════════════════════════════════════════════════════

  async moderateContent(content: string): Promise<{ safe: boolean; category?: string }> {
    if (this.groq.available) {
      return this.groq.moderateContent(content);
    }
    // Basic keyword fallback if Groq unavailable
    const harmful = ['spam', 'scam', 'fraud', 'porn', 'hack'].some((w) =>
      content.toLowerCase().includes(w),
    );
    return { safe: !harmful };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SENTIMENT ANALYSIS
  // ════════════════════════════════════════════════════════════════════════════

  async analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
    const systemPrompt = `Analyze the sentiment of the following text. Respond with EXACTLY ONE WORD: "positive", "neutral", or "negative".`;
    
    try {
      const result = await this.chat(systemPrompt, text, {
        task: 'fast-chat',
        temperature: 0,
        maxTokens: 10,
        cacheTtl: 86400,
      });
      
      const sentiment = result.content.trim().toLowerCase();
      if (sentiment.includes('positive')) return 'positive';
      if (sentiment.includes('negative')) return 'negative';
      return 'neutral';
    } catch (error) {
      this.logger.warn(`Sentiment analysis failed: ${String(error)}`);
      return 'neutral'; // default to neutral on failure
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AMEBOGIST — Article generation (replicates your existing AIService class)
  // ════════════════════════════════════════════════════════════════════════════

  async generateArticle(options: {
    topic: string;
    style?: 'news' | 'amebo' | 'startup' | 'tech-update';
    language?: 'pidgin' | 'english' | 'yoruba' | 'igbo' | 'hausa';
    model?: 'groq' | 'gemini' | 'openai';
  }) {
    const { topic, style = 'amebo', language = 'pidgin', model = 'gemini' } = options;

    const systemPrompt = `You are an expert Nigerian journalist for AmeboGist, a platform focused on AI, Tech, and Creator entrepreneurship in Nigeria.
Your style is highly engaging, authoritative yet conversational.
When writing in Pidgin, be authentic and use modern urban Lagos slang where appropriate.
Focus on providing value to Nigerian entrepreneurs and tech enthusiasts.
${LANGUAGE_INSTRUCTIONS[language]}`;

    const styleGuide: Record<string, string> = {
      news: 'factual, balanced, journalistic, inverted pyramid structure',
      amebo: 'gossipy but professional, insider scoop feel, "you heard it here first" energy',
      startup: 'founder-focused, lessons-learned angle, Nigerian ecosystem perspective',
      'tech-update': 'technical but accessible, "what this means for Naija tech" angle',
    };

    const userMessage = `Write a ${styleGuide[style]} article about: ${topic}.

The article MUST be in ${language}.
Format as JSON with: { title, excerpt (max 160 chars), content (full HTML with h2/p/ul tags), tags (array of 5 strings), seoTitle (max 60 chars), seoDescription (max 160 chars) }`;

    const providerMap: Record<string, ChatOptions['forceProvider']> = {
      groq: 'groq', gemini: 'gemini', openai: 'openai',
    };

    const result = await this.generateJson<{
      title: string;
      excerpt: string;
      content: string;
      tags: string[];
      seoTitle: string;
      seoDescription: string;
    }>(systemPrompt, userMessage, {
      task: language !== 'english' ? 'nigerian-language' : 'creative',
      forceProvider: providerMap[model],
      temperature: 0.75,
      cacheTtl: 1800, // 30 min cache for articles
    });

    return result.content;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE: ROUTING ENGINE
  // ════════════════════════════════════════════════════════════════════════════

  private async routeByTask(
    task: AiTask,
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions,
  ): Promise<AiChatResult> {
    const providers = this.getProviderPriorityForTask(task);

    for (const provider of providers) {
      try {
        return await this.callSpecificProvider(provider, systemPrompt, userMessage, options);
      } catch (err) {
        this.logger.warn(`Provider ${provider} failed for task ${task}: ${String(err)}`);
        continue;
      }
    }

    throw new Error(`All AI providers failed for task: ${task}`);
  }

  private getProviderPriorityForTask(task: AiTask): Array<ChatOptions['forceProvider']> {
    const priorities: Record<AiTask, Array<ChatOptions['forceProvider']>> = {
      'fast-chat': ['groq', 'gemini', 'cloudflare', 'openai'],
      'reasoning': ['groq', 'gemini', 'openai'],
      'creative': ['gemini', 'groq', 'openai'],
      'nigerian-language': ['gemini', 'groq', 'openai'],
      'json-extraction': ['groq', 'gemini', 'openai'],
      'long-context': ['gemini', 'groq', 'openai'],   // Gemini has 1M ctx
      'conversation': ['groq', 'gemini', 'openai'],
      'code': ['groq', 'gemini', 'openai'],
      'moderation': ['groq', 'openai', 'gemini'],
    };
    return priorities[task] ?? ['groq', 'gemini', 'openai'];
  }

  private async callSpecificProvider(
    provider: ChatOptions['forceProvider'],
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions,
  ): Promise<AiChatResult> {
    const { temperature, maxTokens, jsonMode, model, useWebSearch } = options;

    switch (provider) {
      case 'groq': {
        if (!this.groq.available) throw new Error('Groq unavailable');
        const groqModel = this.selectGroqModel(options) as GroqModel;
        const r = await this.groq.chat(systemPrompt, userMessage, {
          model: groqModel,
          temperature,
          maxTokens,
          jsonMode,
        });
        return {
          content: r.content,
          provider: 'groq',
          model: r.model,
          tokens: r.totalTokens,
          latencyMs: r.latencyMs,
          cached: false,
        };
      }

      case 'gemini': {
        if (!this.gemini.available) throw new Error('Gemini unavailable');
        const geminiModel = this.selectGeminiModel(options) as GeminiModel;
        const r = await this.gemini.chat(systemPrompt, userMessage, {
          model: geminiModel,
          temperature,
          maxTokens,
          jsonMode,
          useGoogleSearch: useWebSearch,
        });
        return {
          content: r.content,
          provider: 'gemini',
          model: r.model,
          tokens: r.totalTokens,
          latencyMs: r.latencyMs,
          cached: false,
        };
      }

      case 'openai': {
        if (!this.openai.available) throw new Error('OpenAI unavailable');
        const r = await this.openai.chat(systemPrompt, userMessage, {
          model: (model as never) ?? 'gpt-4o-mini',
          temperature,
          maxTokens,
          jsonMode,
        });
        return {
          content: r.content,
          provider: 'openai',
          model: r.model,
          tokens: r.totalTokens,
          latencyMs: r.latencyMs,
          cached: false,
        };
      }

      case 'ollama': {
        if (!this.ollama.available) throw new Error('Ollama unavailable');
        const r = await this.ollama.chat(systemPrompt, userMessage, {
          model: model ?? undefined,
          temperature,
          format: jsonMode ? 'json' : undefined,
        });
        return {
          content: r.content,
          provider: 'ollama',
          model: r.model,
          tokens: 0,
          latencyMs: r.latencyMs,
          cached: false,
        };
      }

      case 'cloudflare': {
        if (!this.cloudflare.cfAvailable) throw new Error('Cloudflare AI unavailable');
        const content = await this.cloudflare.chatCF(systemPrompt, userMessage);
        return {
          content,
          provider: 'cloudflare',
          model: 'llama-3.3-70b-fp8',
          tokens: 0,
          latencyMs: 0,
          cached: false,
        };
      }

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private selectGroqModel(options: ChatOptions): string {
    if (options.model) return options.model;
    switch (options.task) {
      case 'fast-chat':
      case 'conversation':
        return 'llama-3.1-8b-instant';   // Fastest
      case 'reasoning':
      case 'json-extraction':
      case 'code':
        return 'llama-3.3-70b-versatile'; // Best quality
      case 'moderation':
        return 'llama-guard-3-8b';
      default:
        return 'llama-3.3-70b-versatile';
    }
  }

  private selectGeminiModel(options: ChatOptions): string {
    if (options.model) return options.model;
    switch (options.task) {
      case 'long-context':
        return 'gemini-1.5-pro';        // 1M context window
      case 'fast-chat':
      case 'conversation':
        return 'gemini-1.5-flash-8b';   // Fastest Gemini
      default:
        return 'gemini-2.5-flash';      // Best balance (+ Google Search support)
    }
  }

  private buildCacheKey(systemPrompt: string, userMessage: string, options: ChatOptions): string {
    const hash = crypto
      .createHash('sha256')
      .update(systemPrompt + userMessage + JSON.stringify({ t: options.task, m: options.model }))
      .digest('hex')
      .slice(0, 32);
    return `ai:cache:${hash}`;
  }

  private logAvailableProviders(): void {
    const providers = [
      { name: 'Groq (FREE)', available: this.groq.available },
      { name: 'Gemini (FREE)', available: this.gemini.available },
      { name: 'Ollama (LOCAL)', available: false }, // checked async
      { name: 'OpenAI (PAID)', available: this.openai.available },
      { name: 'CF Workers AI (FREE)', available: this.cloudflare.cfAvailable },
      { name: 'fal.ai (PAID)', available: this.cloudflare.falAvailable },
    ];

    const available = providers.filter((p) => p.available).map((p) => p.name);
    const unavailable = providers.filter((p) => !p.available).map((p) => p.name);

    if (available.length) this.logger.log(`AI Providers available: ${available.join(', ')}`);
    if (unavailable.length) this.logger.debug(`AI Providers not configured: ${unavailable.join(', ')}`);
  }
}

