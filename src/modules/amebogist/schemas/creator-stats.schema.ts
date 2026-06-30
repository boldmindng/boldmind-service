import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ICreatorStats extends Document {
    userId: string; // References Postgres User.id
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    totalArticles: number;
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    totalComments: number;
    totalEarningsKobo: number;
    monthlyEarningsKobo: number;
    currentMonthViews: number;
    adsenseEnabled: boolean;
    paystackSubAccountCode?: string;
    revenueSharePercent: number; // e.g. 70 (70% to creator)
    isVerified: boolean;
    verifiedAt?: Date;
    topCategories: string[];
    followerCount: number;
    subscriberCount: number; // paid subscribers
    badges: Array<{ name: string; awardedAt: Date }>;
    lastPublishedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export const CreatorStatsSchema = new Schema<ICreatorStats>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        displayName: { type: String, required: true },
        avatarUrl: String,
        bio: { type: String, maxlength: 500 },
        totalArticles: { type: Number, default: 0 },
        totalViews: { type: Number, default: 0, index: true },
        totalLikes: { type: Number, default: 0 },
        totalShares: { type: Number, default: 0 },
        totalComments: { type: Number, default: 0 },
        totalEarningsKobo: { type: Number, default: 0 },
        monthlyEarningsKobo: { type: Number, default: 0 },
        currentMonthViews: { type: Number, default: 0 },
        adsenseEnabled: { type: Boolean, default: false },
        paystackSubAccountCode: String,
        revenueSharePercent: { type: Number, default: 70 },
        isVerified: { type: Boolean, default: false, index: true },
        verifiedAt: Date,
        topCategories: [{ type: String }],
        followerCount: { type: Number, default: 0 },
        subscriberCount: { type: Number, default: 0 },
        badges: [
            {
                name: { type: String, required: true },
                awardedAt: { type: Date, default: Date.now },
            },
        ],
        lastPublishedAt: Date,
    },
    {
        timestamps: true,
        collection: 'creator_stats',
    }
);

CreatorStatsSchema.index({ totalViews: -1 }); // Leaderboard
CreatorStatsSchema.index({ isVerified: 1, totalArticles: -1 });

export const CreatorStats = mongoose.model<ICreatorStats>(
    'CreatorStats',
    CreatorStatsSchema
);