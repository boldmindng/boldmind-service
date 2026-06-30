import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../../ai/ai.service';
import { Translation } from './translation.schema';

const SUPPORTED_PAIRS: Record<string, string[]> = {
  english: ['pidgin', 'yoruba', 'igbo', 'hausa', 'french'],
  pidgin: ['english', 'yoruba'],
  yoruba: ['english', 'pidgin'],
  igbo: ['english'],
  hausa: ['english'],
  french: ['english', 'pidgin'],
};

@Injectable()
export class KoloAiService {
  private readonly logger = new Logger(KoloAiService.name);

  constructor(private readonly ai: AiService) {}

  async translate(userId: string, dto: {
    text: string;
    from: string;
    to: string;
    formality?: 'formal' | 'informal' | 'neutral';
    domain?: string;
    context?: string;
  }) {
    const { text, from, to, formality = 'neutral', domain, context } = dto;

    const systemPrompt = `You are KoloAI, a translation expert specializing in Nigerian and West African languages.
Translate the given text accurately from ${from} to ${to}.
Formality level: ${formality}.
${domain ? `Domain/context: ${domain}.` : ''}
${context ? `Additional context: ${context}.` : ''}

Return ONLY valid JSON:
{
  "translation": "the translated text",
  "confidence": 0.95,
  "alternatives": [{"text": "alternative phrasing", "confidence": 0.8}],
  "notes": "any linguistic notes or caveats"
}`;

    const result = await this.ai.generateJson<{
      translation: string;
      confidence: number;
      alternatives: Array<{ text: string; confidence: number }>;
      notes?: string;
    }>(systemPrompt, text, { task: 'nigerian-language' });

    const wordCount = text.split(/\s+/).length;

    const doc = await Translation.create({
      userId,
      sourceLanguage: from,
      targetLanguage: to,
      sourceText: text,
      translatedText: result.content.translation,
      context,
      formality,
      domain,
      quality: {
        confidence: result.content.confidence,
        alternatives: result.content.alternatives ?? [],
      },
      usage: {
        characterCount: text.length,
        wordCount,
      },
    });

    this.logger.log(`Translation ${from}→${to} saved for user ${userId}`);

    return {
      id: doc._id,
      translation: result.content.translation,
      confidence: result.content.confidence,
      alternatives: result.content.alternatives,
      notes: result.content.notes,
      usage: { characterCount: text.length, wordCount },
    };
  }

  async getHistory(userId: string, query: { from?: string; to?: string; page?: number; limit?: number }) {
    const { from, to, page = 1, limit = 20 } = query;
    const filter: any = { userId };
    if (from) filter.sourceLanguage = from;
    if (to) filter.targetLanguage = to;

    const [items, total] = await Promise.all([
      Translation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Translation.countDocuments(filter),
    ]);

    return { items, total, page, pageSize: limit };
  }

  getSupportedLanguages() {
    return {
      languages: Object.keys(SUPPORTED_PAIRS),
      pairs: SUPPORTED_PAIRS,
    };
  }

  async submitFeedback(userId: string, translationId: string, rating: number, comment?: string) {
    await Translation.updateOne(
      { _id: translationId, userId },
      { $set: { feedback: { rating, comment } } },
    );
    return { success: true };
  }
}
