import {
  Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HubService } from './hub.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtPayload } from '../auth/auth.service';

@ApiTags('Hub')
@Controller('hub')
export class HubController {
  constructor(private readonly hubService: HubService) {}

  @Get('products')
  @ApiOperation({ summary: 'Get all ecosystem products' })
  getProducts() {
    return this.hubService.getProducts();
  }

  @Get('pricing')
  @ApiOperation({ summary: 'Get pricing plans' })
  getPricing() {
    return this.hubService.getPricing();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('dashboard')
  @ApiOperation({ summary: 'Get hub dashboard stats' })
  getDashboardStats() {
    return this.hubService.getDashboardStats();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin', 'manager')
  @ApiBearerAuth('access-token')
  @Get('team')
  @ApiOperation({ summary: 'Get team members' })
  getTeam() {
    return this.hubService.getTeam();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Post('team/invite')
  @ApiOperation({ summary: 'Invite a team member' })
  inviteTeamMember(
    @Body() body: { email: string; role: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.hubService.inviteTeamMember(body.email, body.role, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @ApiBearerAuth('access-token')
  @Delete('team/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a team member' })
  removeTeamMember(
    @Param('userId') userId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.hubService.removeTeamMember(userId, actor.sub);
  }
}
