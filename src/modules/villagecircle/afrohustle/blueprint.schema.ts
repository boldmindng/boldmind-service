import mongoose, { Schema, Document } from 'mongoose';

export interface IBlueprint extends Document {
    title: string;
    slug: string;
    category: 'digital' | 'service' | 'product' | 'agriculture' | 'ecommerce' | 'content';
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    startupCost: { min: number; max: number; currency: string };
    timeToProfit: string;
    skillsRequired: string[];
    marketSize: string;
    competitionLevel: 'low' | 'medium' | 'high';
    content: {
        overview: string;
        stepByStep: Array<{
            title: string;
            description: string;
            estimatedTime: string;
            resources: Array<{ name: string; url: string; type: string }>;
            checklist: string[];
        }>;
        tools: Array<{ name: string; purpose: string; cost: string; alternatives: string[] }>;
        caseStudies: Array<{ name: string; story: string; revenue: string; lessons: string[] }>;
        faqs: Array<{ question: string; answer: string }>;
    };
    nigerianContext: {
        regulations: string;
        locationAdvantages: string[];
        challenges: string[];
        successStories: string[];
    };
    stats: { views: number; saves: number; completions: number; successRate?: number };
    isVerified: boolean;
    verifiedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BlueprintSchema = new Schema<IBlueprint>(
    {
        title: { type: String, required: true },
        slug: { type: String, required: true, unique: true, index: true },
        category: {
            type: String,
            required: true,
            enum: ['digital', 'service', 'product', 'agriculture', 'ecommerce', 'content'],
            index: true,
        },
        difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
        startupCost: {
            min: { type: Number, required: true },
            max: { type: Number, required: true },
            currency: { type: String, default: 'NGN' },
        },
        timeToProfit: { type: String, required: true },
        skillsRequired: [String],
        marketSize: String,
        competitionLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
        content: {
            overview: { type: String, required: true },
            stepByStep: [{
                title: String,
                description: String,
                estimatedTime: String,
                resources: [{ name: String, url: String, type: String }],
                checklist: [String],
            }],
            tools: [{ name: String, purpose: String, cost: String, alternatives: [String] }],
            caseStudies: [{ name: String, story: String, revenue: String, lessons: [String] }],
            faqs: [{ question: String, answer: String }],
        },
        nigerianContext: {
            regulations: String,
            locationAdvantages: [String],
            challenges: [String],
            successStories: [String],
        },
        stats: {
            views: { type: Number, default: 0 },
            saves: { type: Number, default: 0 },
            completions: { type: Number, default: 0 },
            successRate: Number,
        },
        isVerified: { type: Boolean, default: false },
        verifiedBy: String,
    },
    { timestamps: true, collection: 'blueprints' },
);

BlueprintSchema.index({ category: 1, difficulty: 1 });
BlueprintSchema.index({ 'stats.views': -1 });

export const Blueprint = mongoose.model<IBlueprint>('Blueprint', BlueprintSchema);
