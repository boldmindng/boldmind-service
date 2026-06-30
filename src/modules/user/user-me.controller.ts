import { Controller, Get, Post, Patch, Delete, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileDto, OnboardingDto } from './user.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('User (self)')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('user')
export class UserMeController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  getMyProfile(@CurrentUser() user: JwtPayload) {
    return this.userService.findById(user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMyProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.sub, dto);
  }

  @Get('products')
  @ApiOperation({ summary: 'Get my active products / subscriptions' })
  getMyProducts(@CurrentUser() user: JwtPayload) {
    return this.userService.getUserProducts(user.sub);
  }

  @Post('onboarding')
  @ApiOperation({ summary: 'Complete onboarding' })
  completeOnboarding(@CurrentUser() user: JwtPayload, @Body() dto: OnboardingDto) {
    return this.userService.completeOnboarding(user.sub, dto);
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my account (soft delete)' })
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.userService.deleteUser(user.sub, user.sub);
  }
}
