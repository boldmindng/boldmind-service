
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OllamaOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    format?: 'json' | undefined;
}

@Injectable()
export class OllamaProvider {
    private readonly logger = new Logger(OllamaProvider.name);
    private readonly baseUrl: string;
    private readonly defaultModel: string;
    private isReachable = false;

    constructor(private readonly config: ConfigService) {
        this.baseUrl = this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
        this.defaultModel = this.config.get<string>('OLLAMA_DEFAULT_MODEL') ?? 'llama3.2';
        // Check availability on startup (non-blocking)
        void this.checkAvailability();
    }

    private async checkAvailability(): Promise<void> {
        try {
            const res = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
            this.isReachable = res.ok;
            if (this.isReachable) {
                this.logger.log(`✅ Ollama available at ${this.baseUrl} (LOCAL — zero cost)`);
            }
        } catch {
            this.isReachable = false;
            this.logger.debug('Ollama not running locally — skipping');
        }
    }

    get available(): boolean {
        return this.isReachable;
    }

    async chat(
        systemPrompt: string,
        userMessage: string,
        options: OllamaOptions = {},
    ): Promise<{ content: string; model: string; latencyMs: number }> {
        const { model = this.defaultModel, temperature = 0.7, format } = options;
        const start = Date.now();

        const response = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                stream: false,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                options: { temperature },
                ...(format ? { format } : {}),
            }),
            signal: AbortSignal.timeout(60_000), // 60s for larger models
        });

        if (!response.ok) throw new Error(`Ollama error: ${await response.text()}`);
        const data = (await response.json()) as { message: { content: string } };
        return { content: data.message.content, model, latencyMs: Date.now() - start };
    }

    async listModels(): Promise<string[]> {
        const res = await fetch(`${this.baseUrl}/api/tags`);
        const data = (await res.json()) as { models: Array<{ name: string }> };
        return data.models.map((m) => m.name);
    }

    async pullModel(modelName: string): Promise<void> {
        this.logger.log(`Pulling Ollama model: ${modelName}...`);
        await fetch(`${this.baseUrl}/api/pull`, {
            method: 'POST',
            body: JSON.stringify({ name: modelName }),
        });
    }
}