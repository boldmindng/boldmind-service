

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { ContentService } from './amebogist.service';
import { RssService } from './rss.service';
import { TrendService } from '../ai/services/trend.service';
import {AiService } from '../ai/ai.service';
import {
  CreatePostDto,
  UpdatePostDto,
  CreateCommentDto,
  ReactToPostDto,
} from './dto';

@Controller('amebogist')
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
    private readonly rssService: RssService,
    private readonly trendService: TrendService,
    private readonly contentAiService: AiService,
  ) {}

  // ──────────────────────────────────────────────────────────────────────────
  // ARTICLES — Public
  // ──────────────────────────────────────────────────────────────────────────

  @Get('articles')
  listArticles(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('search') search?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: 'latest' | 'trending' | 'featured',
  ) {
    return this.contentService.listArticles({
      page,
      limit: Math.min(limit, 50),
      category,
      tag,
      search: search ?? q,
      sort: sort ?? 'latest',
    });
  }

  /** GET /amebogist/search — separate handler, not a stacked decorator */
  @Get('search')
  searchArticles(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.contentService.listArticles({
      page,
      limit: Math.min(limit, 50),
      search: q ?? search,
      category,
      sort: 'latest',
    });
  }

  // ── TRENDING ───────────────────────────────────────────────────────────────

  @Get('articles/trending')
  getTrendingArticles(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.contentService.getTrending(Math.min(limit, 20), category);
  }

  /** GET /amebogist/trending — flat alias for AmebogistEndpoints.getTrending() */
  @Get('trending')
  getTrendingFlat(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.contentService.getTrending(Math.min(limit, 20), category);
  }

  // ── FEATURED ──────────────────────────────────────────────────────────────

  @Get('articles/featured')
  getFeatured() {
    return this.contentService.getFeatured();
  }

  // ── CATEGORIES ────────────────────────────────────────────────────────────

  /**
   * GET /amebogist/categories  ← was 404-ing before (stacked decorator bug)
   * GET /amebogist/articles/categories  ← nested alias
   * Both are now separate methods pointing to the same service call.
   */
  @Get('categories')
  getCategories() {
    return this.contentService.getCategories();
  }

  @Get('articles/categories')
  getArticlesCategories() {
    return this.contentService.getCategories();
  }

  // ── AI / TRENDS — must be BEFORE :slug param to avoid route collision ─────

  /**
   * POST /amebogist/articles/generate-ai
   * MUST be declared before @Get('articles/:slug') or NestJS will match
   * "generate-ai" as a slug value.
   */
  @UseGuards(JwtAuthGuard)
  @Post('articles/generate-ai')
  async generateAIPost(
    @Body() dto: any,
    @CurrentUser() user: { id: string },
  ) {
    const generated = await this.contentAiService.generateArticle({
      ...dto,
      userId: user.id,
    });
    return { data: generated };
  }

  /** GET /amebogist/articles/trends — external trend alerts from TrendService */
  @Get('articles/trends')
  async getTrends() {
    const trends = await this.trendService.getTrendingTechUpdates();
    return { data: trends };
  }

  // ── SINGLE ARTICLE — keep AFTER all /articles/* static routes ────────────

  @Get('articles/:slug')
  getArticle(@Param('slug') slug: string) {
    return this.contentService.getArticleBySlug(slug);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ARTICLES — Authenticated
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('articles')
  createArticle(
    @Body() dto: CreatePostDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.createArticle(dto, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('articles/:id')
  updateArticle(
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.updateArticle(id, dto, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('articles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteArticle(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.deleteArticle(id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('articles/:id/publish')
  publishArticle(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.publishArticle(id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('articles/:id/archive')
  archiveArticle(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.archiveArticle(id, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post('articles/:id/video-factory')
  async triggerVideoFactory(
    @Param('id') id: string,
    @CurrentUser() _user: { id: string },
  ) {
    // ASSUMPTION: Video factory is a future feature. Queue a job for it.
    // Replace with actual VideoFactoryService when implemented.
    const article = await this.contentService.getArticleById(id);
    return {
      data: {
        queued: true,
        articleId: id,
        slug: article.slug,
        message: 'Video generation queued — coming soon',
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REACTIONS
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('articles/:id/react')
  react(
    @Param('id') postId: string,
    @Body() dto: ReactToPostDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.contentService.toggleReaction(postId, user.id, dto.type);
  }

  @Post('articles/:slug/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  trackView(@Param('slug') slug: string) {
    return this.contentService.incrementView(slug);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // COMMENTS
  // ──────────────────────────────────────────────────────────────────────────

  @Get('articles/:id/comments')
  getComments(
    @Param('id') postId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.contentService.getComments(postId, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Post('articles/:id/comments')
  addComment(
    @Param('id') postId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser()
    user: { id: string; profile: { displayName: string; avatarUrl?: string } },
  ) {
    return this.contentService.addComment(postId, dto, user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteComment(
    @Param('id') commentId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contentService.deleteComment(commentId, user.id, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('comments/:id/react')
  reactToComment(
    @Param('id') commentId: string,
    @Body('reaction') reaction: 'like' | 'dislike' | 'love',
    @CurrentUser() user: { id: string },
  ) {
    return this.contentService.reactToComment(commentId, user.id, reaction);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATOR ROUTES — Authenticated
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('creator/my-articles')
  myArticles(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('status') status?: 'draft' | 'published' | 'archived',
  ) {
    return this.contentService.getCreatorArticles(user.id, page, status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('creator/stats')
  creatorStats(@CurrentUser() user: { id: string }) {
    return this.contentService.getCreatorStats(user.id);
  }

  /** GET /amebogist/me/stats — flat alias for AmebogistEndpoints.getMyStats() */
  @UseGuards(JwtAuthGuard)
  @Get('me/stats')
  meStats(@CurrentUser() user: { id: string }) {
    return this.contentService.getCreatorStats(user.id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ADMIN ROUTES
  // ──────────────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @Patch('articles/:id/feature')
  featureArticle(@Param('id') id: string) {
    return this.contentService.toggleFeatured(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @Patch('comments/:id/flag')
  flagComment(@Param('id') id: string) {
    return this.contentService.flagComment(id);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RSS FEEDS — Public
  // ──────────────────────────────────────────────────────────────────────────

  @Get('rss')
  getRssFeed() {
    return this.rssService.generateMainFeed();
  }

  @Get('rss/:category')
  getCategoryFeed(@Param('category') category: string) {
    return this.rssService.generateCategoryFeed(category);
  }
}