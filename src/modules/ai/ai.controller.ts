
import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { TrendService } from './services/trend.service';
import { VideoFactoryService } from './services/video-factory.service';
import { GroqProvider } from './providers/groq.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { CloudflareAiProvider } from './providers/cloudflare.provider';
import { OllamaProvider } from './providers/ollama.provider';

@Controller('admin/ai')
// @UseGuards(JwtAuthGuard, RolesGuard) — add guards from auth module
// @Roles('admin', 'super_admin')
export class AiAdminController {
    constructor(
        private readonly ai: AiService,
        private readonly trends: TrendService,
        private readonly groq: GroqProvider,
        private readonly gemini: GeminiProvider,
        private readonly openai: OpenAIProvider,
        private readonly cf: CloudflareAiProvider,
        private readonly ollama: OllamaProvider,
    ) { }

    @Get('status')
    async getStatus() {
        const ollamaModels = this.ollama.available
            ? await this.ollama.listModels().catch(() => [])
            : [];

        return {
            providers: {
                groq: { available: this.groq.available, freeQuota: '6,000 RPM / 500k tokens per day' },
                gemini: { available: this.gemini.available, freeQuota: '15 RPM / 1M tokens per day (Flash)' },
                openai: { available: this.openai.available, estimatedSpendUsd: this.openai.estimatedTotalSpend },
                cloudflare: { available: this.cf.cfAvailable, freeQuota: '10,000 neurons/day' },
                falAi: { available: this.cf.falAvailable },
                ollama: { available: this.ollama.available, models: ollamaModels },
            },
            recommendation: this.getProviderRecommendation(),
        };
    }

    @Get('trends')
    getTrends() {
        return this.trends.getTrendingForBoldMind();
    }

    @Get('trends/tech')
    getTechTrends() {
        return this.trends.getTrendingTechUpdates();
    }

    @Get('trends/ai')
    getAiTrends() {
        return this.trends.getAiTrends();
    }

    @Get('content-ideas')
    getContentIdeas() {
        return this.trends.generateContentIdeas(10);
    }

    @Post('test')
    async testProvider(@Body() body: { provider: string; prompt: string }) {
        const result = await this.ai.chat(
            'You are a test assistant.',
            body.prompt,
            { forceProvider: body.provider as never, cacheTtl: 0 },
        );
        return result;
    }

    @Post('image/generate')
    async generateTestImage(@Body() body: { prompt: string; format: 'square' | 'landscape' }) {
        const result = await this.ai.generateSocialImage(body.prompt, body.format ?? 'square');
        return {
            provider: result.provider,
            hasBuffer: !!result.data,
            url: result.url,
        };
    }

    private getProviderRecommendation(): string {
        const available = [
            this.groq.available && 'Groq (fast, free)',
            this.gemini.available && 'Gemini (language quality, free)',
            this.cf.cfAvailable && 'CF Workers AI (images, free)',
            this.openai.available && 'OpenAI (paid fallback)',
        ].filter(Boolean);

        if (available.length === 0) return '⚠️ No AI providers configured. Set at least GROQ_API_KEY or GEMINI_API_KEY.';
        if (!this.groq.available) return '💡 Add GROQ_API_KEY for faster, free inference';
        if (!this.gemini.available) return '💡 Add GEMINI_API_KEY for better Nigerian language support';
        return `✅ Running optimally with: ${available.join(', ')}`;
    }
}
