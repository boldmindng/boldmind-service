import { Controller, Get, Patch, Delete, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto, UpdateProfileDto, UserQueryDto, OnboardingDto } from './user.dto';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'List all users (admin)' })
  findAll(@Query() query: UserQueryDto) {
    return this.userService.findAll(query);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get current user dashboard' })
  dashboard(@CurrentUser('id') userId: string) {
    return this.userService.getUserDashboard(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  update(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.userService.updateUser(id, actorId, dto);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Get user activity log' })
  activity(
    @Param('id') id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.userService.getActivityLog(id, +page, +limit);
  }

  @Delete(':id/ban')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'Ban a user (admin)' })
  ban(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body('reason') reason: string,
  ) {
    return this.userService.banUser(id, reason, actorId);
  }

  @Post('onboarding')
  @ApiOperation({ summary: 'Complete user onboarding' })
  completeOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() dto: OnboardingDto,
  ) {
    return this.userService.completeOnboarding(user.sub, dto);
  }
}