

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CFImageOptions {
    width?: number;
    height?: number;
    steps?: number;         // 4 = fast (FLUX schnell), 20+ = quality
    guidance?: number;
    negativePrompt?: string;
    seed?: number;
}

export interface FalImageOptions {
    imageSize?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';
    numSteps?: number;
    guidanceScale?: number;
    seed?: number;
    numImages?: number;
}

@Injectable()
export class CloudflareAiProvider {
    private readonly logger = new Logger(CloudflareAiProvider.name);

    // CF Workers AI credentials
    private readonly cfAccountId: string;
    private readonly cfApiToken: string;
    private readonly cfIsAvailable: boolean;

    // fal.ai credentials
    private readonly falApiKey: string;
    private readonly falIsAvailable: boolean;

    constructor(private readonly config: ConfigService) {
        this.cfAccountId = this.config.get<string>('CLOUDFLARE_ACCOUNT_ID') ?? '';
        this.cfApiToken = this.config.get<string>('CLOUDFLARE_API_TOKEN') ?? '';
        this.cfIsAvailable = !!(this.cfAccountId && this.cfApiToken);

        this.falApiKey = this.config.get<string>('FAL_API_KEY') ?? '';
        this.falIsAvailable = !!this.falApiKey;

        if (this.cfIsAvailable) {
            this.logger.log('✅ Cloudflare Workers AI initialized (FREE 10k neurons/day)');
        }
        if (this.falIsAvailable) {
            this.logger.log('✅ fal.ai initialized (FLUX.1 Pro for logos)');
        }
    }

    get cfAvailable(): boolean { return this.cfIsAvailable; }
    get falAvailable(): boolean { return this.falIsAvailable; }

    // ──────────────────────────────────────────────────────────────────────────
    // IMAGE GENERATION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * FLUX.1 Schnell via Cloudflare — COMPLETELY FREE (10k neurons/day)
     * Returns base64 image. Fast, good quality for banners/social media.
     */
    async generateImageCF(prompt: string, options: CFImageOptions = {}): Promise<Buffer> {
        const {
            width = 1024,
            height = 1024,
            steps = 4,       // FLUX schnell is optimized for 4 steps
            seed,
        } = options;

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.cfApiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    width,
                    height,
                    num_steps: steps,
                    ...(seed ? { seed } : {}),
                }),
            },
        );

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Cloudflare AI image error: ${err}`);
        }

        // CF Workers AI returns raw binary for image models
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer);
    }

    /**
     * SDXL via Cloudflare — FREE, higher quality than FLUX schnell for portraits
     */
    async generateImageSDXL(prompt: string, options: CFImageOptions = {}): Promise<Buffer> {
        const { width = 1024, height = 1024, steps = 20, negativePrompt, seed } = options;

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.cfApiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    negative_prompt: negativePrompt,
                    width,
                    height,
                    num_inference_steps: steps,
                    ...(seed ? { seed } : {}),
                }),
            },
        );

        if (!response.ok) throw new Error(`CF SDXL error: ${await response.text()}`);
        return Buffer.from(await response.arrayBuffer());
    }

    /**
     * fal.ai FLUX.1 Pro — highest quality, paid but cheap (~$0.003/image)
     * Used specifically for: Logo generation, brand kits, pitch deck visuals
     */
    async generateImageFal(
        prompt: string,
        model: 'fal-ai/flux-pro' | 'fal-ai/flux/schnell' | 'fal-ai/flux-realism' = 'fal-ai/flux-pro',
        options: FalImageOptions = {},
    ): Promise<string[]> {
        const {
            imageSize = 'square_hd',
            numSteps = 25,
            guidanceScale = 3.5,
            seed,
            numImages = 1,
        } = options;

        const response = await fetch(`https://fal.run/${model}`, {
            method: 'POST',
            headers: {
                Authorization: `Key ${this.falApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt,
                image_size: imageSize,
                num_inference_steps: numSteps,
                guidance_scale: guidanceScale,
                num_images: numImages,
                enable_safety_checker: true,
                ...(seed ? { seed } : {}),
            }),
        });

        if (!response.ok) throw new Error(`fal.ai error: ${await response.text()}`);
        const data = (await response.json()) as { images: Array<{ url: string }> };
        return data.images.map((img) => img.url);
    }

    /**
     * WhatsApp flyer generator — specific branded output for Nigerian SMEs
     * Uses FLUX schnell (free) with Nigerian-market-aware prompting
     */
    async generateWhatsAppFlyer(params: {
        businessName: string;
        offer: string;
        price?: string;
        style?: 'modern' | 'traditional' | 'luxury' | 'playful';
    }): Promise<Buffer> {
        const { businessName, offer, price, style = 'modern' } = params;

        const styleGuide: Record<string, string> = {
            modern: 'clean minimalist design, green and white color scheme, modern sans-serif fonts',
            traditional: 'vibrant Ankara-inspired patterns, Nigerian cultural elements, warm earthy tones',
            luxury: 'premium gold and black luxury aesthetic, elegant typography, sophisticated',
            playful: 'bright colorful Nigeria flag-inspired palette, bold energetic typography',
        };

        const prompt = `Professional business flyer for Nigerian market. Business: "${businessName}". 
Offer: "${offer}". ${price ? `Price: ${price}` : ''}. 
Design style: ${styleGuide[style]}. 
Portrait format 9:16, clean layout, space for text overlay, WhatsApp share-ready.
High quality commercial photography style.`;

        return this.generateImageCF(prompt, { width: 1080, height: 1920, steps: 4 });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AUDIO TRANSCRIPTION (FREE via CF Workers AI)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Whisper transcription via Cloudflare — FREE (same model as OpenAI Whisper)
     * Use this instead of OpenAI Whisper to save costs
     */
    async transcribeAudio(audioBuffer: Buffer): Promise<string> {
        const base64Audio = audioBuffer.toString('base64');

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/ai/run/@cf/openai/whisper`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.cfApiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ audio: base64Audio }),
            },
        );

        if (!response.ok) throw new Error(`CF Whisper error: ${await response.text()}`);
        const data = (await response.json()) as { result: { text: string } };
        return data.result.text;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEXT INFERENCE via CF Workers AI (overflow / local dev)
    // ──────────────────────────────────────────────────────────────────────────

    async chatCF(systemPrompt: string, userMessage: string): Promise<string> {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.cfAccountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.cfApiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage },
                    ],
                    max_tokens: 1024,
                }),
            },
        );

        if (!response.ok) throw new Error(`CF chat error: ${await response.text()}`);
        const data = (await response.json()) as { result: { response: string } };
        return data.result.response;
    }
}