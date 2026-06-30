// src/modules/notification/notification.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../database/database.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    DatabaseModule,
    HttpModule, // for direct WhatsApp Graph API calls
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService], // exported so AuthModule, PaymentModule etc. can inject it
})
export class NotificationModule {}