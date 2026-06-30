import mongoose, { Schema, Document } from 'mongoose';

// ==================== INTERFACES & SCHEMAS ====================

interface IAuthor {
    id: string;
    name: string;
    avatar?: string;
    isVerified: boolean;
}

interface IMedia {
    featuredImage?: string;
    gallery: string[];
    videoUrl?: string;
}

interface IEngagement {
    views: number;
    likes: number;
    shares: number;
    commentsCount: number;
    readingTime: number;
}

interface ISEO {
    metaTitle?: string;
    metaDescription?: string;
    keywords: string[];
    ogImage?: string;
}

interface IAffiliateLink {
    text: string;
    url: string;
    clicks: number;
}

interface IMonetization {
    hasAds: boolean;
    affiliateLinks: IAffiliateLink[];
    sponsored: boolean;
}

export interface IPost extends Document {
    slug: string;
    title: string;
    content: {
        pidgin: string;
        english?: string;
        yoruba?: string;
        igbo?: string;
        hausa?: string;
    };
    excerpt: string;
    category: string;
    subcategory?: string;
    tags: string[];
    author: IAuthor;
    media: IMedia;
    engagement: IEngagement;
    seo: ISEO;
    monetization: IMonetization;
    aiMetadata?: {
        sourceTrend?: string;
        sourcePlatform?: string;
        promptUsed?: string;
    };
    distributionStatus?: {
        socialShared: boolean;
        videoConverted: boolean;
        factoryJobId?: string;
    };
    status: 'draft' | 'published' | 'archived';
    isFeatured: boolean;
    source: 'manual' | 'ai' | 'imported';
    editorialNote?: string; // Former "commentary"
    publishedAt?: Date;
    scheduledFor?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export const PostSchema = new Schema<IPost>(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            index: true,
            match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        },
        title: { type: String, required: true, trim: true },
        content: {
            pidgin: { type: String, required: true },
            english: String,
            yoruba: String,
            igbo: String,
            hausa: String,
        },
        excerpt: { type: String, required: true, maxlength: 300 },
        category: {
            type: String,
            required: true,
            enum: ['ai-tech', 'creator', 'sports', 'politics', 'entertainment', 'trending', 'general'],
            index: true
        },
        subcategory: String,
        tags: [{ type: String, index: true, lowercase: true }],
        author: {
            id: { type: String, required: true, index: true },
            name: { type: String, required: true },
            avatar: String,
            isVerified: { type: Boolean, default: false }
        },
        media: {
            featuredImage: String,
            gallery: [{ type: String }],
            videoUrl: String
        },
        engagement: {
            views: { type: Number, default: 0, index: true },
            likes: { type: Number, default: 0 },
            shares: { type: Number, default: 0 },
            commentsCount: { type: Number, default: 0 },
            readingTime: { type: Number, default: 0 }
        },
        seo: {
            metaTitle: String,
            metaDescription: String,
            keywords: [{ type: String, lowercase: true }],
            ogImage: String
        },
        monetization: {
            hasAds: { type: Boolean, default: true },
            affiliateLinks: [{
                text: String,
                url: String,
                clicks: { type: Number, default: 0 }
            }],
            sponsored: { type: Boolean, default: false }
        },
        aiMetadata: {
            sourceTrend: String,
            sourcePlatform: String,
            promptUsed: String
        },
        distributionStatus: {
            socialShared: { type: Boolean, default: false },
            videoConverted: { type: Boolean, default: false },
            factoryJobId: String
        },
        status: {
            type: String,
            enum: ['draft', 'published', 'archived'],
            default: 'draft',
            index: true
        },
        isFeatured: { type: Boolean, default: false, index: true },
        source: {
            type: String,
            enum: ['manual', 'ai', 'imported'],
            default: 'manual',
            index: true
        },
        editorialNote: String,
        publishedAt: Date,
        scheduledFor: Date
    },
    {
        timestamps: true,
        collection: 'posts',
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Compound indexes for AmeboGist queries
PostSchema.index({ status: 1, publishedAt: -1 });
PostSchema.index({ category: 1, status: 1, publishedAt: -1 });
PostSchema.index({ isFeatured: 1, status: 1 });
PostSchema.index({ 'engagement.views': -1, status: 1 }); // Trending
PostSchema.index({ tags: 1, status: 1 });

// Full-text search index
PostSchema.index(
  { title: 'text', excerpt: 'text', 'content.pidgin': 'text', 'content.english': 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, excerpt: 3, 'content.pidgin': 1, 'content.english': 1 }, name: 'posts_text_search' }
);

export const Post = mongoose.model<IPost>('Post', PostSchema);
