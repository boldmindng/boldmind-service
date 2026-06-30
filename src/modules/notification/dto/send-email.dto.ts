import { IsString, IsOptional, IsArray, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendEmailDto {
    @ApiPropertyOptional({ description: 'User ID for logging' })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty({ example: 'user@example.com', description: 'Recipient email(s)' })
    to: string | string[];

    @ApiProperty({ example: 'Your BoldMind Update' })
    @IsString()
    subject: string;

    @ApiPropertyOptional({ description: 'HTML body' })
    @IsOptional()
    @IsString()
    html?: string;

    @ApiPropertyOptional({ description: 'Plain text body' })
    @IsOptional()
    @IsString()
    text?: string;

    @ApiPropertyOptional({ description: 'Custom from address' })
    @IsOptional()
    @IsString()
    from?: string;

    @ApiPropertyOptional({ description: 'Reply-to address' })
    @IsOptional()
    @IsString()
    replyTo?: string;

    @ApiPropertyOptional({ description: 'Email tags for analytics' })
    @IsOptional()
    tags?: Array<{ name: string; value: string }>;
}
