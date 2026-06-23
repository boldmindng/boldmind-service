import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ContentService } from './amebogist.service';
import { ContentController } from './amebogist.controller';
import { RssService } from './rss.service';
import { TrendService } from '../ai/services/trend.service';


// Schemas
import { Post, PostSchema } from './schemas/post.schema';
import { Comment, CommentSchema } from './schemas/comment.schema';
import { CreatorStats, CreatorStatsSchema } from './schemas/creator-stats.schema';
import { Reaction, ReactionSchema } from './schemas/reaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Post', schema: PostSchema },
      { name: 'Comment', schema: CommentSchema },
      { name: 'CreatorStats', schema: CreatorStatsSchema },
      { name: 'Reaction', schema: ReactionSchema },
    ]),
  ],
  controllers: [ContentController],
  providers: [
    ContentService, 
    RssService,
    TrendService,
  ],
  exports: [ContentService],
})
export class ContentModule {}