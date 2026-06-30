
import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';


@ApiTags('Admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
@ApiBearerAuth('access-token')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ─────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get full ecosystem dashboard stats' })
  getStats() {
    return this.adminService.getDashboardStats();
  }

  // ── Users ─────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Get full user list with filters' })
  users(@Query() query: any) {
    return this.adminService.getFullUserList(query);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Update user role' })
  updateRole(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @Body('role') role: string,
  ) {
    return this.adminService.updateUserRole(id, role, actorId);
  }

  // ── Revenue ───────────────────────────────────────────────

  @Get('revenue')
  @ApiOperation({ summary: 'Get revenue report for a period' })
  revenue(@Query('period') period: 'week' | 'month' | 'quarter' | 'year' = 'month') {
    return this.adminService.getRevenueReport(period);
  }

  // ── Waitlist ──────────────────────────────────────────────

  @Get('waitlist')
  @ApiOperation({ summary: 'Get waitlist stats per product' })
  waitlist() {
    return this.adminService.getWaitlistStats();
  }

  @Post('waitlist/:productSlug/invite')
  @ApiOperation({ summary: 'Invite next N users from a product waitlist' })
  invite(@Param('productSlug') slug: string, @Body('count') count = 10) {
    return this.adminService.inviteFromWaitlist(slug, +count);
  }

  // ── Audit logs ────────────────────────────────────────────

  @Get('logs')
  @ApiOperation({ summary: 'Get admin audit log' })
  logs(@Query('page') page = 1, @Query('limit') limit = 50) {
    return this.adminService.getAdminLogs(+page, +limit);
  }
}
