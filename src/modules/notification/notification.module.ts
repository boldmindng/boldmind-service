// src/modules/notification/notification.module.ts
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { BullModule } from "@nestjs/bullmq";
import { Resend } from "resend";
import { DatabaseModule } from "../../database/database.module";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { EmailBroadcastProcessor } from "./processors/email-broadcast.processor";
import { PushBroadcastProcessor } from "./processors/push-broadcast.processor";
import { OTPService } from "@boldmindng/sms";
import { ResendOtpEmailProvider } from "./providers/resend-otp-email.provider";
import { OTP_SERVICE } from "./notification.tokens";
import { QUEUES } from "../../common/constants/queues";

// Note: ConfigModule is not re-imported here — it's registered with
// isGlobal: true in app.module.ts, so ConfigService is already injectable
// everywhere without a local import.

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
        const resend = new Resend(config.get<string>("RESEND_API_KEY"));
        const fromEmail = config.get<string>(
          "RESEND_FROM_EMAIL",
          "hello@boldmind.ng",
        );

        // OTPServiceConfig (packages/sms/src/types.ts) is EXACTLY:
        //   { whatsapp: WhatsAppProviderConfig,
        //     termii:   TermiiProviderConfig,
        //     emailProvider?: EmailOTPProvider }
        //
        // There is no `sms` or `email` key on that type — OTPService builds
        // its own WhatsAppProvider/TermiiProvider internally from `whatsapp`
        // and `termii`; the only thing it can't build itself is the email
        // fallback, which is why `emailProvider` is the one piece we inject.
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
