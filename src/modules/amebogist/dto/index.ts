import {
    IsString,
    IsEnum,
    IsOptional,
    IsBoolean,
    IsArray,
    IsUrl,
    MaxLength,
    MinLength,
    IsMongoId,
    IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ─── Post DTOs ─────────────────────────────────────────────────────────────

export class CreatePostDto {
    @IsString() @MinLength(10) @MaxLength(200)
    title: string;

    @IsOptional() @IsString()
    authorName?: string;

    content: {
        pidgin: string;
        english?: string;
        yoruba?: string;
        igbo?: string;
        hausa?: string;
    };

    @IsString() @MaxLength(300)
    excerpt: string;

    @IsEnum(['ai-tech', 'creator', 'sports', 'politics', 'entertainment', 'trending', 'general'])
    category: string;

    @IsOptional() @IsString()
    subcategory?: string;

    @IsOptional() @IsArray() @IsString({ each: true })
    @Transform(({ value }) => Array.isArray(value) ? value.map((t: string) => t.toLowerCase().trim()) : [])
    tags?: string[];

    @IsOptional()
    media?: {
        featuredImage?: string;
        gallery?: string[];
        videoUrl?: string;
    };

    @IsOptional()
    seo?: {
        metaTitle?: string;
        metaDescription?: string;
        keywords?: string[];
    };

    @IsOptional()
    scheduledFor?: Date;

    @IsOptional() @IsString()
    editorialNote?: string;
}

export class UpdatePostDto {
    @IsOptional() @IsString() @MinLength(10) @MaxLength(200)
    title?: string;

    @IsOptional()
    content?: {
        pidgin?: string;
        english?: string;
        yoruba?: string;
        igbo?: string;
        hausa?: string;
    };

    @IsOptional() @IsString() @MaxLength(300)
    excerpt?: string;

    @IsOptional()
    @IsEnum(['ai-tech', 'creator', 'sports', 'politics', 'entertainment', 'trending', 'general'])
    category?: string;

    @IsOptional() @IsArray()
    tags?: string[];

    @IsOptional()
    media?: { featuredImage?: string; gallery?: string[]; videoUrl?: string };

    @IsOptional()
    seo?: { metaTitle?: string; metaDescription?: string; keywords?: string[] };

    @IsOptional() @IsString()
    editorialNote?: string;
}

export class ListPostsQueryDto {
    @IsOptional() @IsString()
    category?: string;

    @IsOptional() @IsString()
    tag?: string;

    @IsOptional() @IsString() @MaxLength(100)
    search?: string;

    @IsOptional() @IsIn(['latest', 'trending', 'featured'])
    sort?: 'latest' | 'trending' | 'featured';
}

// ─── Comment DTOs ──────────────────────────────────────────────────────────

export class CreateCommentDto {
    @IsString() @MinLength(1) @MaxLength(1000)
    content: string;

    @IsOptional() @IsMongoId()
    parentId?: string;

    @IsOptional() @IsIn(['pidgin', 'english', 'yoruba', 'igbo', 'hausa'])
    language?: 'pidgin' | 'english' | 'yoruba' | 'igbo' | 'hausa';
}

// ─── Reaction DTOs ─────────────────────────────────────────────────────────

export class ReactToPostDto {
    @IsIn(['like', 'love', 'laugh', 'fire', 'sad', 'angry'])
    type: 'like' | 'love' | 'laugh' | 'fire' | 'sad' | 'angry';
}