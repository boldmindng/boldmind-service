import {
  Controller, Get, Post, Body, Query, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { KoloAiService } from './kolo-ai.service';

@ApiTags('VillageCircle / KoloAI')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('villagecircle/kolo-ai')
export class KoloAiController {
  constructor(private readonly service: KoloAiService) {}

  @Get('languages')
  @ApiOperation({ summary: 'Get supported language pairs' })
  languages() {
    return this.service.getSupportedLanguages();
  }

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Translate text between Nigerian/African languages' })
  translate(
    @CurrentUser('id') userId: string,
    @Body() dto: {
      text: string;
      from: string;
      to: string;
      formality?: 'formal' | 'informal' | 'neutral';
      domain?: string;
      context?: string;
    },
  ) {
    return this.service.translate(userId, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get translation history' })
  history(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getHistory(userId, { from, to, page, limit });
  }

  @Post('feedback/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit feedback for a translation' })
  feedback(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: { rating: number; comment?: string },
  ) {
    return this.service.submitFeedback(userId, id, dto.rating, dto.comment);
  }
}
