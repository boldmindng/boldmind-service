
import { Module } from '@nestjs/common';
import { EduCenterController } from './educenter.controller';
import { EduCenterService } from './educenter.service';
import { AlocService } from './services/aloc.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';

@Module({
    imports: [AuthModule],
    controllers: [EduCenterController],
    providers: [
        EduCenterService,
        AlocService,
        PrismaService,
        RedisService,
    ],
    exports: [EduCenterService, AlocService],
})
export class EduCenterModule { }
