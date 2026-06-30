import {
    Controller, Post, Get, Delete, Body, Param, Query, UseGuards,
    HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { SendPushDto, SubscribePushDto } from './dto/send-push.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, Roles, Public } from '../../common/decorators';

@ApiTags('Notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
    constructor(private readonly notifService: NotificationService) { }

    // ─── USER NOTIFICATIONS ───────────────────────────────────

    @Get()
    @ApiOperation({ summary: 'Get current user notifications' })
    getMyNotifications(
        @CurrentUser('id') userId: string,
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ) {
        return this.notifService.getUserNotifications(userId, +page, +limit);
    }

    @Post('read')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Mark notifications as read' })
    markAsRead(
        @CurrentUser('id') userId: string,
        @Body('ids') ids?: string[],
    ) {
        return this.notifService.markAsRead(userId, ids);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete a notification' })
    deleteNotification(
        @CurrentUser('id') userId: string,
        @Param('id') id: string,
    ) {
        return this.notifService.deleteNotification(userId, id);
    }

    // ─── PUSH SUBSCRIPTION ────────────────────────────────────

    @Post('push/subscribe')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Subscribe to web push notifications' })
    subscribePush(
        @CurrentUser('id') userId: string,
        @Body() dto: SubscribePushDto,
    ) {
        return this.notifService.subscribePush(userId, {
            endpoint: dto.endpoint,
            keys: dto.keys,
        }, dto.deviceLabel);
    }

    @Post('push/unsubscribe')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Unsubscribe from push notifications' })
    unsubscribePush(@Body('endpoint') endpoint: string) {
        return this.notifService.unsubscribePush(endpoint);
    }

    // ─── ADMIN: BROADCAST ─────────────────────────────────────

    @Post('broadcast/push')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Broadcast push notification to all users (admin)' })
    broadcastPush(@Body() dto: SendPushDto) {
        return this.notifService.broadcastToAll(dto);
    }

    @Post('broadcast/email')
    @UseGuards(RolesGuard)
    @Roles('ADMIN', 'SUPER_ADMIN')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Broadcast email to all or a segment (admin)' })
    broadcastEmail(
        @Body() body: { subject: string; html: string; segment?: 'all' | 'pro' | 'free' },
    ) {
        return this.notifService.broadcastEmail(body.subject, body.html, body.segment);
    }
}
