import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendPushDto {
    @ApiProperty({ example: 'New Message' })
    @IsString()
    title: string;

    @ApiProperty({ example: 'You have a new notification' })
    @IsString()
    body: string;

    @ApiPropertyOptional({ description: 'Icon URL' })
    @IsOptional()
    @IsString()
    icon?: string;

    @ApiPropertyOptional({ description: 'Click-through URL' })
    @IsOptional()
    @IsString()
    url?: string;

    @ApiPropertyOptional({ description: 'Custom data payload' })
    @IsOptional()
    data?: Record<string, any>;
}

export class SubscribePushDto {
    @ApiProperty({ description: 'Push subscription endpoint URL' })
    @IsString()
    endpoint: string;

    @ApiProperty({ description: 'Push subscription keys' })
    keys: { p256dh: string; auth: string };

    @ApiPropertyOptional({ description: 'Device label' })
    @IsOptional()
    @IsString()
    deviceLabel?: string;
}
