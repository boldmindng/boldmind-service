import { Schema } from 'mongoose';

export const PromptTemplateSchema = new Schema(
    {
        key: { type: String, unique: true },
        description: String,
        systemPrompt: String,
        userPrompt: String,
        variables: [String],
        model: String,
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);
