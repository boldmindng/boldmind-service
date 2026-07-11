// src/modules/notification/notification.module.ts
import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { BullModule } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { DatabaseModule } from "../../database/database.module";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { EmailBroadcastProcessor } from "./processors/email-broadcast.processor";
import { PushBroadcastProcessor } from "./processors/push-broadcast.processor";
import { OTPService } from "@boldmindng/sms";
import { ResendOtpEmailProvider } from "./providers/resend-otp-email.provider";
import { QUEUES } from "../../common/constants/queues";

export const OTP_SERVICE = Symbol("OTP_SERVICE");

@Module({
  imports: [
    DatabaseModule,
    HttpModule, // for direct WhatsApp Graph API calls (sendWhatsapp())
    BullModule.registerQueue(
      { name: QUEUES.EMAIL_NOTIFICATIONS },
      { name: QUEUES.PUSH_NOTIFICATIONS },
    ),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    EmailBroadcastProcessor,
    PushBroadcastProcessor,
    {
      provide: OTP_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // OTPService (packages/sms/src/otp.service.ts) constructs its own
        // WhatsAppProvider + TermiiProvider internally from a single
        // OTPServiceConfig — it does NOT accept provider instances as
        // positional args. emailProvider is the one piece it can't build
        // itself (by design, to stay decoupled from @boldmindng/email),
        // so we inject the Resend-backed adapter here.
        const resend = new Resend(config.get<string>("RESEND_API_KEY"));
        const fromEmail = config.get<string>(
          "RESEND_FROM_EMAIL",
          "hello@boldmind.ng",
        );

        return new OTPService({
          whatsapp: {
            phoneNumberId: config.get<string>(
              "META_WHATSAPP_PHONE_NUMBER_ID",
              "",
            ),
            accessToken: config.get<string>("META_WHATSAPP_ACCESS_TOKEN", ""),
          },
          termii: {
            apiKey: config.get<string>("TERMII_API_KEY", ""),
            senderId: config.get<string>("TERMII_SENDER_ID", "BOLDMIND"),
          },
          emailProvider: new ResendOtpEmailProvider(resend, fromEmail),
        });
      },
    },
  ],
  // exported so AuthModule, PaymentModule etc. can inject NotificationService
  // AND the shared OTP_SERVICE instance (one OTPService per process, not one per module)
  exports: [NotificationService, OTP_SERVICE],
})
export class NotificationModule {}
