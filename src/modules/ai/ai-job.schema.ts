import { Schema } from 'mongoose';

export const AIJobSchema = new Schema(
    {
        userId: String,
        app: String, // planai, branding, analytics, etc
        taskType: String, // generate, analyze, summarize, predict

        input: Schema.Types.Mixed,
        output: Schema.Types.Mixed,

        model: String,
        tokensUsed: Number,
        latencyMs: Number,

        status: {
            type: String,
            enum: ['queued', 'running', 'completed', 'failed'],
            default: 'queued',
        },

        error: Schema.Types.Mixed,
    },
    { timestamps: true }
);
