import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { AfroHustleService } from './afrohustle.service';

@ApiTags('VillageCircle / AfroHustle')
@Controller('villagecircle/afrohustle')
export class AfroHustleController {
  constructor(private readonly service: AfroHustleService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get blueprint categories' })
  categories() {
    return this.service.getCategories();
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured business blueprints (public)' })
  featured() {
    return this.service.getFeatured();
  }

  @Get()
  @ApiOperation({ summary: 'Browse business blueprints (public)' })
  list(
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listBlueprints({ category, difficulty, page, limit });
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a blueprint by slug (public)' })
  findBySlug(@Param('slug') slug: string) {
    return this.service.getBlueprintBySlug(slug);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a blueprint by ID (public)' })
  findById(@Param('id') id: string) {
    return this.service.getBlueprintById(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI-generate a custom business blueprint' })
  generate(
    @CurrentUser('id') userId: string,
    @Body() dto: {
      businessIdea: string;
      category: string;
      startupBudget: number;
      location: string;
    },
  ) {
    return this.service.generateBlueprint(userId, dto);
  }
}
