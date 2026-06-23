import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fal } from '@fal-ai/client';

export interface GenerateImageOptions {
  prompt: string;
  model: string;
  aspectRatio: string;
  numImages?: number;
  seed?: number;
  negativePrompt?: string;
  guidanceScale?: number;
  style?: string;
}

export interface EditImageOptions {
  imageUrl: string;
  prompt: string;
  model?: string;
  mask?: string;
  strength?: number;
}

export interface GenerateVideoOptions {
  prompt: string;
  model: string;
  aspectRatio: string;
  duration: number;
  imageUrl?: string;
  negativePrompt?: string;
  seed?: number;
}

export interface FalImageResult {
  imageUrl?: string;
  images?: Array<{ url: string; width: number; height: number }>;
  falRequestId: string;
}

export interface FalVideoResult {
  fileUrl: string;
  falRequestId: string;
}

// Maps our aspect ratio strings to fal.ai format
const FAL_MODEL_MAP: Record<string, string> = {
  'flux-pro-ultra': 'fal-ai/flux-pro/v1.1-ultra',
  'flux-pro': 'fal-ai/flux-pro/v1.1',
  'flux-dev': 'fal-ai/flux/dev',
  'flux-schnell': 'fal-ai/flux/schnell',
  'flux-inpainting': 'fal-ai/flux/dev/image-to-image',
  'aura-sr': 'fal-ai/aura-sr',
  'bria-bg-removal': 'fal-ai/bria-background-removal',
  'kling-video-v2-master': 'fal-ai/kling-video/v2/master/text-to-video',
  'wan-pro': 'fal-ai/wan-pro/v1.1/text-to-video',
  'luma-dream-machine': 'fal-ai/luma-dream-machine',
};

@Injectable()
export class FalProvider {
  private readonly logger = new Logger(FalProvider.name);

  constructor(private readonly config: ConfigService) {
    fal.config({ credentials: this.config.get<string>('FAL_API_KEY') });
  }

  async generateImage(opts: GenerateImageOptions): Promise<FalImageResult> {
    const modelId = FAL_MODEL_MAP[opts.model] ?? opts.model;
    this.logger.log(`generateImage → ${modelId}`);

    const result = await fal.run(modelId, {
      input: {
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio,
        num_images: opts.numImages ?? 1,
        seed: opts.seed,
        negative_prompt: opts.negativePrompt,
        guidance_scale: opts.guidanceScale,
        style: opts.style,
      },
    }) as any;

    return {
      images: result.images ?? (result.image ? [result.image] : []),
      imageUrl: result.images?.[0]?.url ?? result.image?.url,
      falRequestId: result.requestId ?? '',
    };
  }

  async editImage(opts: EditImageOptions): Promise<FalImageResult> {
    const modelId = FAL_MODEL_MAP[opts.model ?? 'flux-inpainting'] ?? opts.model;
    this.logger.log(`editImage → ${modelId}`);

    const result = await fal.run(modelId, {
      input: {
        image_url: opts.imageUrl,
        prompt: opts.prompt,
        mask_url: opts.mask,
        strength: opts.strength ?? 0.85,
      },
    }) as any;

    return {
      images: result.images ?? (result.image ? [result.image] : []),
      imageUrl: result.images?.[0]?.url ?? result.image?.url,
      falRequestId: result.requestId ?? '',
    };
  }

  async upscaleImage(imageUrl: string): Promise<FalImageResult> {
    this.logger.log('upscaleImage → aura-sr');
    const result = await fal.run(FAL_MODEL_MAP['aura-sr'], {
      input: { image_url: imageUrl },
    }) as any;

    return {
      imageUrl: result.image?.url,
      falRequestId: result.requestId ?? '',
    };
  }

  async removeBackground(imageUrl: string): Promise<FalImageResult> {
    this.logger.log('removeBackground → bria-bg-removal');
    const result = await fal.run(FAL_MODEL_MAP['bria-bg-removal'], {
      input: { image_url: imageUrl },
    }) as any;

    return {
      imageUrl: result.image?.url,
      falRequestId: result.requestId ?? '',
    };
  }

  async generateVideo(opts: GenerateVideoOptions): Promise<FalVideoResult> {
    const modelId = FAL_MODEL_MAP[opts.model] ?? opts.model;
    this.logger.log(`generateVideo → ${modelId}`);

    const result = await fal.run(modelId, {
      input: {
        prompt: opts.prompt,
        aspect_ratio: opts.aspectRatio,
        duration: opts.duration,
        image_url: opts.imageUrl,
        negative_prompt: opts.negativePrompt,
        seed: opts.seed,
      },
    }) as any;

    const fileUrl = result.video?.url ?? result.output?.video?.url;
    if (!fileUrl) throw new InternalServerErrorException('Video generation returned no URL');

    return { fileUrl, falRequestId: result.requestId ?? '' };
  }
}
