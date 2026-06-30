import mongoose, { Schema, Document, Types } from 'mongoose';


export interface IReaction extends Document {
    postId: Types.ObjectId;
    userId: string; // References Postgres User.id
    type: 'like' | 'love' | 'laugh' | 'fire' | 'sad' | 'angry';
    createdAt: Date;
}

export const ReactionSchema = new Schema<IReaction>(
    {
        postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
        userId: { type: String, required: true, index: true },
        type: {
            type: String,
            enum: ['like', 'love', 'laugh', 'fire', 'sad', 'angry'],
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'reactions',
    }
);

// One reaction per user per post (upsert on toggle)
ReactionSchema.index({ postId: 1, userId: 1 }, { unique: true });

export const Reaction = mongoose.model<IReaction>('Reaction', ReactionSchema);