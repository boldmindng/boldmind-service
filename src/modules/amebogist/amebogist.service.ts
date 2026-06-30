
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model, Types } from 'mongoose';
import { Queue } from 'bullmq';
import { IPost } from './schemas/post.schema';
import { IComment } from './schemas/comment.schema';
import { ICreatorStats } from './schemas/creator-stats.schema';
import { IReaction } from './schemas/reaction.schema';
import { CreatePostDto, UpdatePostDto, CreateCommentDto } from './dto/index';
import { generateSlug } from '../../common/utils/slug.util';
import { RedisService } from '../../database/redis.service';

const CACHE_TTL = 300;
const TRENDING_CACHE_TTL = 600;


export interface CommentAuthor {
  id: string;
  name: string;
  avatar?: string;
  isAuthor: boolean;
}

export interface CommentReactions {
  like: number;
  love: number;
  laugh: number;
  angry: number;
}

export interface CommentDto {
  _id: string;
  postId: string;
  parentId?: string;
  user: CommentAuthor;
  content: string;
  language: 'pidgin' | 'english' | 'yoruba';
  reactions: CommentReactions;
  isEdited: boolean;
  editedAt?: Date;
  isFlagged: boolean;
  createdAt: Date;
  updatedAt: Date;
  replies: CommentDto[];
}

export interface PaginatedComments {
  data: CommentDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface ReactToCommentResult {
  _id: string;
  reactions: CommentReactions;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    @InjectModel('Post') private readonly postModel: Model<IPost>,
    @InjectModel('Comment') private readonly commentModel: Model<IComment>,
    @InjectModel('CreatorStats') private readonly creatorStatsModel: Model<ICreatorStats>,
    @InjectModel('Reaction') private readonly reactionModel: Model<IReaction>,
    @InjectQueue('content') private readonly contentQueue: Queue,
    private readonly redis: RedisService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // LIST ARTICLES
  // ──────────────────────────────────────────────────────────────────────────

  async listArticles(params: {
    page: number;
    limit: number;
    category?: string;
    tag?: string;
    search?: string;
    sort: 'latest' | 'trending' | 'featured';
  }) {
    const cacheKey = `articles:list:${JSON.stringify(params)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const filter: Record<string, unknown> = { status: 'published' };
    if (params.category) filter['category'] = params.category;
    if (params.tag) filter['tags'] = params.tag.toLowerCase();
    if (params.search) filter['$text'] = { $search: params.search };

    let sortQuery: Record<string, 1 | -1> = { publishedAt: -1 };
    if (params.sort === 'trending') sortQuery = { 'engagement.views': -1, publishedAt: -1 };
    if (params.sort === 'featured') {
      filter['isFeatured'] = true;
      sortQuery = { publishedAt: -1 };
    }

    const skip = (params.page - 1) * params.limit;

    const [articles, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select(
          'slug title excerpt category tags author.name author.avatar author.isVerified ' +
          'media.featuredImage engagement.views engagement.likes engagement.readingTime ' +
          'isFeatured publishedAt',
        )
        .sort(sortQuery)
        .skip(skip)
        .limit(params.limit)
        .lean<IPost[]>(),
      this.postModel.countDocuments(filter),
    ]);

    const result = {
      data: articles,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
        hasNextPage: skip + articles.length < total,
      },
    };

    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
    return result;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GET ARTICLE BY SLUG / ID
  // ──────────────────────────────────────────────────────────────────────────

  async getArticleBySlug(slug: string): Promise<IPost> {
    const cacheKey = `article:slug:${slug}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as IPost;

    const article = await this.postModel
      .findOne({ slug, status: 'published' })
      .lean<IPost>();

    if (!article) throw new NotFoundException(`Article "${slug}" not found`);

    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(article));
    return article;
  }

  async getArticleById(id: string): Promise<IPost> {
    const article = await this.postModel.findById(id).lean<IPost>();
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TRENDING / FEATURED / CATEGORIES
  // ──────────────────────────────────────────────────────────────────────────

  async getTrending(limit: number, category?: string) {
    const cacheKey = `articles:trending:${limit}:${category ?? 'all'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const filter: Record<string, unknown> = {
      status: 'published',
      publishedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    };
    if (category) filter['category'] = category;

    const articles = await this.postModel
      .find(filter)
      .select('slug title excerpt category media.featuredImage engagement author.name publishedAt')
      .sort({ 'engagement.views': -1, 'engagement.likes': -1 })
      .limit(limit)
      .lean<IPost[]>();
        console.log(`Caching trending articles with key fo seconds`, articles);
    await this.redis.setex(cacheKey, TRENDING_CACHE_TTL, JSON.stringify(articles));
    return articles;
  }

  async getFeatured() {
    const cacheKey = 'articles:featured';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const articles = await this.postModel
      .find({ status: 'published', isFeatured: true })
      .select('slug title excerpt category media.featuredImage engagement author publishedAt')
      .sort({ publishedAt: -1 })
      .limit(6)
      .lean<IPost[]>();

    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(articles));
    return articles;
  }

  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    const cacheKey = 'articles:categories';
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const categories = await this.postModel.aggregate<{ category: string; count: number }>([
      { $match: { status: 'published' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, category: '$_id', count: 1 } },
    ]);

    await this.redis.setex(cacheKey, 3600, JSON.stringify(categories));
    return categories;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE / UPDATE / PUBLISH / ARCHIVE / DELETE
  // ──────────────────────────────────────────────────────────────────────────

  async createArticle(dto: CreatePostDto, userId: string): Promise<IPost> {
    const slug = await this.generateUniqueSlug(dto.title);
    const readingTime = this.calculateReadingTime(dto.content.pidgin);

    const article = await this.postModel.create({
      ...dto,
      slug,
      author: { id: userId, name: dto.authorName ?? 'BoldMind Team', isVerified: false },
      engagement: { views: 0, likes: 0, shares: 0, commentsCount: 0, readingTime },
      status: 'draft',
    });

    await this.contentQueue.add(
      'generate-seo',
      { articleId: article._id.toString(), title: dto.title, excerpt: dto.excerpt },
      { delay: 2000, attempts: 3 },
    );

    return article;
  }

  async updateArticle(id: string, dto: UpdatePostDto, userId: string, userRole: string): Promise<IPost> {
    const article = await this.getArticleById(id);
    this.assertOwnerOrAdmin(article.author.id, userId, userRole);

    const updated = await this.postModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .lean<IPost>();

    if (!updated) throw new NotFoundException('Article not found after update');
    await this.bustArticleCache(article.slug);
    return updated;
  }

  async publishArticle(id: string, userId: string, userRole: string) {
    const article = await this.getArticleById(id);
    this.assertOwnerOrAdmin(article.author.id, userId, userRole);
    if (article.status === 'published') throw new BadRequestException('Already published');

    const updated = await this.postModel.findByIdAndUpdate(
      id,
      { $set: { status: 'published', publishedAt: new Date() } },
      { new: true },
    );

    await Promise.all([
      this.contentQueue.add(
        'distribute-social',
        { articleId: id, slug: article.slug },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      ),
      this.updateCreatorStats(article.author.id, 'publish'),
      this.bustArticleCache(article.slug),
    ]);

    return updated;
  }

  async archiveArticle(id: string, userId: string, userRole: string): Promise<void> {
    const article = await this.getArticleById(id);
    this.assertOwnerOrAdmin(article.author.id, userId, userRole);
    await this.postModel.findByIdAndUpdate(id, { $set: { status: 'archived' } });
    await this.bustArticleCache(article.slug);
  }

  async deleteArticle(id: string, userId: string, userRole: string): Promise<void> {
    const article = await this.getArticleById(id);
    this.assertOwnerOrAdmin(article.author.id, userId, userRole);

    await Promise.all([
      this.postModel.findByIdAndDelete(id),
      this.commentModel.deleteMany({ postId: new Types.ObjectId(id) }),
      this.reactionModel.deleteMany({ postId: new Types.ObjectId(id) }),
    ]);

    await this.bustArticleCache(article.slug);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REACTIONS (article-level)
  // ──────────────────────────────────────────────────────────────────────────

  async toggleReaction(postId: string, userId: string, type: 'like' | 'love' | 'laugh' | 'fire' | 'sad' | 'angry') {
    const postObjectId = new Types.ObjectId(postId);
    const existing = await this.reactionModel.findOne({ postId: postObjectId, userId });

    if (existing) {
      if (existing.type === type) {
        await existing.deleteOne();
        await this.postModel.findByIdAndUpdate(postId, { $inc: { 'engagement.likes': -1 } });
        return { reacted: false };
      }
      existing.type = type;
      await existing.save();
      return { reacted: true, type };
    }

    await this.reactionModel.create({ postId: postObjectId, userId, type });
    await this.postModel.findByIdAndUpdate(postId, { $inc: { 'engagement.likes': 1 } });
    return { reacted: true, type };
  }

  async incrementView(slug: string): Promise<void> {
    await this.postModel.updateOne({ slug, status: 'published' }, { $inc: { 'engagement.views': 1 } });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // COMMENTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Explicit return type: PaginatedComments
   *
   * Fixes ts(2742) — "inferred type of 'getComments' cannot be named without
   * a reference to .pnpm/mongodb@6.21.0". Root cause: Mongoose lean() infers
   * FlattenMaps<IComment> which drills into mongodb internal types that
   * TypeScript refuses to serialize for declaration files.
   *
   * Fix: lean<IComment[]>() + explicit toCommentDto() conversion. The
   * toCommentDto() method maps raw lean output to plain CommentDto objects,
   * breaking the deep inference chain entirely.
   */
  async getComments(postId: string, page: number, limit: number): Promise<PaginatedComments> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid article ID');
    }
    const postObjectId = new Types.ObjectId(postId);
    const skip = (page - 1) * limit;

    const [rawComments, total] = await Promise.all([
      this.commentModel
        .find({ postId: postObjectId, parentId: null, isFlagged: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IComment[]>(),
      this.commentModel.countDocuments({ postId: postObjectId, parentId: null }),
    ]);

    // Fetch replies for the returned page of comments in one query
    const commentIds = rawComments.map((c) => (c as unknown as { _id: Types.ObjectId })._id);

    const rawReplies = await this.commentModel
      .find({ parentId: { $in: commentIds }, isFlagged: false })
      .sort({ createdAt: 1 })
      .lean<IComment[]>();

    const replyMap = new Map<string, CommentDto[]>();
    for (const r of rawReplies) {
      const raw = r as unknown as { _id: Types.ObjectId; parentId: Types.ObjectId };
      const key = raw.parentId.toString();
      if (!replyMap.has(key)) replyMap.set(key, []);
      replyMap.get(key)!.push(this.toCommentDto(r, []));
    }

    const data = rawComments.map((c) => {
      const raw = c as unknown as { _id: Types.ObjectId };
      return this.toCommentDto(c, replyMap.get(raw._id.toString()) ?? []);
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async addComment(
    postId: string,
    dto: CreateCommentDto,
    user: { id: string; profile: { displayName: string; avatarUrl?: string } },
  ) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid article ID');
    }
    const article = await this.postModel.findById(postId).select('_id author.id').lean<IPost>();
    if (!article) throw new NotFoundException('Article not found');

    const comment = await this.commentModel.create({
      postId: new Types.ObjectId(postId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      user: {
        id: user.id,
        name: user.profile.displayName,
        avatar: user.profile.avatarUrl,
        isAuthor: article.author.id === user.id,
      },
      content: dto.content,
      language: dto.language ?? 'pidgin',
    });

    await this.postModel.findByIdAndUpdate(postId, { $inc: { 'engagement.commentsCount': 1 } });
    return comment;
  }

  async deleteComment(commentId: string, userId: string, userRole: string): Promise<void> {
    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    this.assertOwnerOrAdmin(comment.user.id, userId, userRole);
    await comment.deleteOne();
    await this.postModel.findByIdAndUpdate(comment.postId, {
      $inc: { 'engagement.commentsCount': -1 },
    });
  }

  /**
   * reactToComment — FIXED
   *
   * PROBLEM: Previous implementation called comment.reactions.delete(userId)
   * and comment.reactions.set(userId, reaction) treating reactions as a Map.
   *
   * REALITY: The comment schema stores reactions as integer COUNTERS:
   *   reactions: { like: number; love: number; laugh: number; angry: number }
   *
   * Fix uses two-field strategy:
   *   - reactions.{type} — integer counter, $inc to add/remove
   *   - userReactions.{userId} — per-user tracking Map<string, reactionType>
   *                              enables toggle (react again = undo)
   *
   * ASSUMPTION: Your comment.schema.ts has:
   *   userReactions: { type: Map, of: String, default: new Map() }
   *
   * Add this field to comment.schema.ts if it doesn't exist yet.
   */
  async reactToComment(
    commentId: string,
    userId: string,
    reaction: 'like' | 'dislike' | 'love',
  ): Promise<ReactToCommentResult> {
    // Map 'dislike' → 'angry' — schema only has like/love/laugh/angry
    const field = (reaction === 'dislike' ? 'angry' : reaction) as 'like' | 'love' | 'laugh' | 'angry';

    const comment = await this.commentModel.findById(commentId);
    if (!comment) throw new NotFoundException('Comment not found');

    // What did this user previously react with?
    const prevField = comment.userReactions?.get(userId) as 'like' | 'love' | 'laugh' | 'angry' | undefined;

    let incUpdate: Record<string, number>;
    let trackingUpdate: Record<string, unknown>;

    if (prevField === field) {
      // Toggle off — undo the reaction
      incUpdate = { [`reactions.${field}`]: -1 };
      trackingUpdate = { $unset: { [`userReactions.${userId}`]: '' } };
    } else {
      if (prevField) {
        // Switching reaction type — decrement old, increment new
        incUpdate = { [`reactions.${field}`]: 1, [`reactions.${prevField}`]: -1 };
      } else {
        // New reaction
        incUpdate = { [`reactions.${field}`]: 1 };
      }
      trackingUpdate = { $set: { [`userReactions.${userId}`]: field } };
    }

    const updated = await this.commentModel
      .findByIdAndUpdate(
        commentId,
        { $inc: incUpdate, ...trackingUpdate },
        { new: true },
      )
      .lean<IComment>();

    if (!updated) throw new NotFoundException('Comment not found after update');

    const raw = updated as unknown as { _id: Types.ObjectId; reactions: CommentReactions };

    return { _id: raw._id.toString(), reactions: raw.reactions };
  }

  async flagComment(commentId: string) {
    return this.commentModel.findByIdAndUpdate(
      commentId,
      { $set: { isFlagged: true } },
      { new: true },
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATOR
  // ──────────────────────────────────────────────────────────────────────────

  async getCreatorArticles(userId: string, page: number, status?: string) {
    const filter: Record<string, unknown> = { 'author.id': userId };
    if (status) filter['status'] = status;

    const limit = 20;
    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      this.postModel
        .find(filter)
        .select('slug title status category engagement publishedAt createdAt')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<IPost[]>(),
      this.postModel.countDocuments(filter),
    ]);

    return { data: articles, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getCreatorStats(userId: string) {
    const [stats, recentArticles] = await Promise.all([
      this.creatorStatsModel.findOne({ userId }).lean(),
      this.postModel
        .find({ 'author.id': userId, status: 'published' })
        .select('title engagement.views engagement.likes publishedAt')
        .sort({ publishedAt: -1 })
        .limit(5)
        .lean<IPost[]>(),
    ]);
    return { stats, recentArticles };
  }

  async toggleFeatured(id: string) {
    const article = await this.postModel.findById(id);
    if (!article) throw new NotFoundException('Article not found');
    article.isFeatured = !article.isFeatured;
    await article.save();
    await this.bustArticleCache(article.slug);
    return { featured: article.isFeatured };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Serializes a Mongoose lean IComment to a plain CommentDto.
   * This is the key step that breaks the deep FlattenMaps inference chain
   * causing ts(2742). Without this, TypeScript tries to name the full
   * Mongoose + MongoDB internal type tree in the declaration file and fails.
   */
  private toCommentDto(raw: IComment, replies: CommentDto[]): CommentDto {
    const r = raw as unknown as {
      _id: Types.ObjectId;
      postId: Types.ObjectId;
      parentId?: Types.ObjectId;
      user: CommentAuthor;
      content: string;
      language: 'pidgin' | 'english' | 'yoruba';
      reactions: CommentReactions;
      isEdited: boolean;
      editedAt?: Date;
      isFlagged: boolean;
      createdAt: Date;
      updatedAt: Date;
    };

    return {
      _id: r._id.toString(),
      postId: r.postId.toString(),
      parentId: r.parentId?.toString(),
      user: r.user,
      content: r.content,
      language: r.language,
      reactions: r.reactions ?? { like: 0, love: 0, laugh: 0, angry: 0 },
      isEdited: r.isEdited ?? false,
      editedAt: r.editedAt,
      isFlagged: r.isFlagged ?? false,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      replies,
    };
  }

  private assertOwnerOrAdmin(ownerId: string, requesterId: string, role: string): void {
    if (ownerId !== requesterId && !['admin', 'super_admin'].includes(role)) {
      throw new ForbiddenException('You do not have permission to modify this resource');
    }
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    let slug = generateSlug(title);
    let suffix = 0;
    while (await this.postModel.exists({ slug })) {
      slug = `${generateSlug(title)}-${++suffix}`;
    }
    return slug;
  }

  private calculateReadingTime(text: string): number {
    return Math.max(1, Math.ceil(text.trim().split(/\s+/).length / 200));
  }

  private async bustArticleCache(slug: string): Promise<void> {
    const ops: Promise<unknown>[] = [
      this.redis.del(`article:slug:${slug}`),
      this.redis.del('articles:featured'),
      this.redis.del('articles:categories'),
    ];

    // ASSUMPTION: RedisService.delPattern() uses SCAN + DEL for wildcard keys.
    // Add to RedisService if missing:
    //   async delPattern(pattern: string) {
    //     const keys = await this.client.keys(pattern); // use SCAN in production
    //     if (keys.length) await this.client.del(...keys);
    //   }
    if (typeof (this.redis as any).delPattern === 'function') {
      ops.push(
        (this.redis as any).delPattern('articles:trending:*'),
        (this.redis as any).delPattern('articles:list:*'),
      );
    }

    await Promise.all(ops);
  }

  private async updateCreatorStats(userId: string, event: 'publish'): Promise<void> {
    if (event === 'publish') {
      await this.creatorStatsModel.findOneAndUpdate(
        { userId },
        { $inc: { totalArticles: 1 }, $set: { lastPublishedAt: new Date() } },
        { upsert: true },
      );
    }
  }
}