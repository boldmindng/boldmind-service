import mongoose, { Schema, Document } from 'mongoose';

export interface ITranslation extends Document {
    userId: string;
    sourceLanguage: string;
    targetLanguage: string;
    sourceText: string;
    translatedText: string;
    context?: string;
    formality: 'formal' | 'informal' | 'neutral';
    domain?: string;
    quality: {
        confidence: number;
        alternatives: Array<{ text: string; confidence: number }>;
    };
    usage: { characterCount: number; wordCount: number };
    feedback?: { rating: number; comment: string };
    createdAt: Date;
}

const TranslationSchema = new Schema<ITranslation>(
    {
        userId: { type: String, required: true, index: true },
        sourceLanguage: { type: String, required: true },
        targetLanguage: { type: String, required: true },
        sourceText: { type: String, required: true },
        translatedText: { type: String, required: true },
        context: String,
        formality: { type: String, enum: ['formal', 'informal', 'neutral'], default: 'neutral' },
        domain: String,
        quality: {
            confidence: Number,
            alternatives: [{ text: String, confidence: Number }],
        },
        usage: { characterCount: Number, wordCount: Number },
        feedback: { rating: Number, comment: String },
    },
    { timestamps: { createdAt: true, updatedAt: false }, collection: 'translations' },
);

TranslationSchema.index({ userId: 1, createdAt: -1 });
TranslationSchema.index({ sourceLanguage: 1, targetLanguage: 1 });

export const Translation = mongoose.model<ITranslation>('Translation', TranslationSchema);
