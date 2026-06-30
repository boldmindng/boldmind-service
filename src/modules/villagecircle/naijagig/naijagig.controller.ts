import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { NaijaGigService } from './naijagig.service';

@ApiTags('VillageCircle / NaijaGig')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('villagecircle/naijagig')
export class NaijaGigController {
  constructor(private readonly service: NaijaGigService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get all gig categories' })
  categories() {
    return this.service.getCategories();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post a new gig (as client)' })
  createGig(@CurrentUser('id') clientId: string, @Body() dto: any) {
    return this.service.createGig(clientId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Browse open gigs (artisan discovery)' })
  listGigs(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('urgency') urgency?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.listGigs({ category, city, state, urgency, page, limit });
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get gigs posted by current user (client view)' })
  myGigs(
    @CurrentUser('id') clientId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getMyGigs(clientId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gig details' })
  findOne(@Param('id') id: string) {
    return this.service.getGigById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a gig (client only)' })
  update(@CurrentUser('id') clientId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateGig(clientId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a gig (client only)' })
  remove(@CurrentUser('id') clientId: string, @Param('id') id: string) {
    return this.service.deleteGig(clientId, id);
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply to a gig (as artisan)' })
  apply(
    @CurrentUser('id') artisanId: string,
    @Param('id') gigId: string,
    @Body() dto: { message: string; bidAmount: number; estimatedTime: string; portfolioItems?: string[] },
  ) {
    return this.service.applyToGig(artisanId, gigId, dto);
  }

  @Patch(':gigId/applications/:artisanId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update application status — shortlist, reject or hire (client only)' })
  updateApplication(
    @CurrentUser('id') clientId: string,
    @Param('gigId') gigId: string,
    @Param('artisanId') artisanId: string,
    @Body() dto: { status: 'shortlisted' | 'rejected' | 'hired' },
  ) {
    return this.service.updateApplicationStatus(clientId, gigId, artisanId, dto.status);
  }
}
