import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/user.decorator';
import { Skill2CashService } from './skill2cash.service';

@ApiTags('VillageCircle / Skill2Cash')
@Controller('villagecircle/skill2cash')
export class Skill2CashController {
  constructor(private readonly service: Skill2CashService) {}

  @Get('browse')
  @ApiOperation({ summary: 'Browse artisan video profiles (public)' })
  browse(
    @Query('skill') skill?: string,
    @Query('category') category?: string,
    @Query('location') location?: string,
    @Query('available') available?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.browseProfiles({
      skill, category, location,
      available: available === 'true' ? true : available === 'false' ? false : undefined,
      page, limit,
    });
  }

  @Get('profile/:id')
  @ApiOperation({ summary: 'View an artisan profile (public)' })
  viewProfile(@Param('id') id: string) {
    return this.service.getProfileById(id);
  }

  @Post('anonymous')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an anonymous artisan profile (no login required)' })
  createAnonymous(@Body() dto: any) {
    return this.service.createAnonymousProfile(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update my artisan profile' })
  createProfile(@CurrentUser('id') userId: string, @Body() dto: any) {
    return this.service.createProfile(userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('me')
  @ApiOperation({ summary: 'Get my artisan profile' })
  myProfile(@CurrentUser('id') userId: string) {
    return this.service.getMyProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Put('profile/:id')
  @ApiOperation({ summary: 'Update my artisan profile' })
  updateProfile(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateProfile(userId, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Patch('availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update availability status' })
  setAvailability(
    @CurrentUser('id') userId: string,
    @Body() dto: { status: 'available' | 'busy' | 'unavailable' },
  ) {
    return this.service.setAvailability(userId, dto.status);
  }
}
