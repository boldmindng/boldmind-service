import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { SubscriptionService } from './subscription.service';

@Module({
    imports: [ConfigModule, EventEmitterModule],
    controllers: [PaymentController],
    providers: [PaymentService, SubscriptionService],
    exports: [PaymentService, SubscriptionService],
})
export class PaymentModule { }
