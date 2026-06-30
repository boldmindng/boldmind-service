import { Controller, Post, Get, Body, Query, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';


@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
    constructor(private readonly analytics: AnalyticsService) { }

    @Public()
    @Post('track')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Track an analytics event (public)' })
    trackEvent(
        @Body() data: { event: string; properties?: Record<string, any>; source?: string; page?: string; sessionId?: string },
        @Req() req: Request,
    ) {
        return this.analytics.trackEvent({
            ...data,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
        });
    }

    @Public()
    @Post('pageview')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Track a page view (public)' })
    trackPageView(
        @Body() data: { page: string; referrer?: string; sessionId?: string },
        @Req() req: Request,
    ) {
        return this.analytics.trackPageView({
            ...data,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
        });
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @Get('dashboard')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Get analytics dashboard (admin)' })
    getDashboard(@Query('period') period: 'day' | 'week' | 'month' = 'week') {
        return this.analytics.getDashboard(period);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Get my analytics' })
    getMyAnalytics(
        @CurrentUser('id') userId: string,
        @Query('period') period: 'day' | 'week' | 'month' = 'week',
    ) {
        return this.analytics.getUserAnalytics(userId, period);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @Get('products')
    @ApiBearerAuth('access-token')
    @ApiOperation({ summary: 'Get product usage analytics (admin)' })
    getProductUsage(@Query('period') period: 'day' | 'week' | 'month' = 'week') {
        return this.analytics.getProductUsage(period);
    }
}
