import mongoose, { Schema, Document } from 'mongoose';

export interface IVideoProfile extends Document {
    userId?: string;
    isAnonymous: boolean;
    anonymousId?: string;
    skills: Array<{ name: string; category: string; experience: string; portfolioItems: string[] }>;
    video: { url: string; duration: number; thumbnail: string; transcript: string; language: string };
    availability: {
        status: 'available' | 'busy' | 'unavailable';
        schedule: Map<string, any>;
        responseTime: string;
    };
    pricing: { hourlyRate: number; minBooking: number; packageRates: Map<string, number> };
    stats: { completedGigs: number; totalEarnings: number; avgRating: number; responseRate: number };
    verification: { phoneVerified: boolean; skillsVerified: boolean; identityVerified: boolean; trustScore: number };
    preferences: { workTypes: string[]; locations: string[]; clientTypes: string[] };
    isActive: boolean;
    lastActive: Date;
    createdAt: Date;
    updatedAt: Date;
}

const VideoProfileSchema = new Schema<IVideoProfile>(
    {
        userId: { type: String, index: true },
        isAnonymous: { type: Boolean, default: true },
        anonymousId: { type: String, unique: true, sparse: true },
        skills: [{
            name: { type: String, required: true },
            category: String,
            experience: String,
            portfolioItems: [String],
        }],
        video: { url: { type: String, required: true }, duration: Number, thumbnail: String, transcript: String, language: String },
        availability: {
            status: { type: String, enum: ['available', 'busy', 'unavailable'], default: 'available' },
            schedule: { type: Map, of: Schema.Types.Mixed },
            responseTime: String,
        },
        pricing: { hourlyRate: Number, minBooking: Number, packageRates: { type: Map, of: Number } },
        stats: {
            completedGigs: { type: Number, default: 0 },
            totalEarnings: { type: Number, default: 0 },
            avgRating: { type: Number, default: 0 },
            responseRate: { type: Number, default: 0 },
        },
        verification: {
            phoneVerified: { type: Boolean, default: false },
            skillsVerified: { type: Boolean, default: false },
            identityVerified: { type: Boolean, default: false },
            trustScore: { type: Number, default: 0 },
        },
        preferences: { workTypes: [String], locations: [String], clientTypes: [String] },
        isActive: { type: Boolean, default: true },
        lastActive: { type: Date, default: Date.now },
    },
    { timestamps: true, collection: 'video_profiles' },
);

VideoProfileSchema.index({ 'skills.category': 1 });
VideoProfileSchema.index({ 'availability.status': 1 });
VideoProfileSchema.index({ isActive: 1 });

export const VideoProfile = mongoose.model<IVideoProfile>('VideoProfile', VideoProfileSchema);
