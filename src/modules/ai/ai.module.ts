
import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { GroqProvider } from './providers/groq.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { CloudflareAiProvider } from './providers/cloudflare.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { TrendService } from './services/trend.service';
import { VideoFactoryService } from './services/video-factory.service';
import { SocialFactoryProcessor } from './processors/social-factory.processor';
import { RedisService } from '../../database/redis.service';
import { FalProvider } from './providers/fal.provider';

// @Global() — makes AiService available everywhere without importing AiModule
// Just import AiModule once in AppModule, then inject AiService in any module
@Global()
@Module({
  imports: [
    ConfigModule
  ],
  providers: [
    // Providers (AI backend adapters)
    GroqProvider,
    GeminiProvider,
    OpenAIProvider,
    CloudflareAiProvider,
    OllamaProvider,
    FalProvider,
    // Core AI gateway
    AiService,

    // Internal services
    TrendService,
    VideoFactoryService,

    // BullMQ processors
    SocialFactoryProcessor,

    // Shared
    RedisService,
  ],
  exports: [
    AiService,
    TrendService,
    VideoFactoryService,
    GroqProvider,
    GeminiProvider,
    FalProvider
  ],
})
export class AiModule { }