import { Module } from '@nestjs/common';
import { NotificationModule } from '../notification/notification.module';
import { VibeCodersController } from './vibecoders/vibecoders.controller';
import { VibeCodersService } from './vibecoders/vibecoders.service';

// Active services
import { ReceiptGeniusController } from './receiptgenius/receiptgenius.controller';
import { ReceiptGeniusService } from './receiptgenius/receiptgenius.service';

import { KoloAiController } from './kolo-ai/kolo-ai.controller';
import { KoloAiService } from './kolo-ai/kolo-ai.service';

import { NaijaGigController } from './naijagig/naijagig.controller';
import { NaijaGigService } from './naijagig/naijagig.service';

import { Skill2CashController } from './skill2cash/skill2cash.controller';
import { Skill2CashService } from './skill2cash/skill2cash.service';

import { FarmgateController } from './farmgate/farmgate.controller';
import { FarmgateService } from './farmgate/farmgate.service';

import { AfroHustleController } from './afrohustle/afrohustle.controller';
import { AfroHustleService } from './afrohustle/afrohustle.service';

import { BorderlessRemitController } from './borderless-remit/borderless-remit.controller';
import { BorderlessRemitService } from './borderless-remit/borderless-remit.service';

import { SafeAiController } from './safeai/safeai.controller';
import { SafeAiService } from './safeai/safeai.service';

// Waiting list stubs
import { WaitlistController } from './waitlist/waitlist.controller';

@Module({
  imports: [NotificationModule],
  controllers: [
    // Active
    ReceiptGeniusController,
    KoloAiController,
    NaijaGigController,
    Skill2CashController,
    FarmgateController,
    AfroHustleController,
    BorderlessRemitController,
    SafeAiController,
    VibeCodersController,
    // Coming soon — returns 503 + waitlist info
    WaitlistController,
  ],
  providers: [
    ReceiptGeniusService,
    KoloAiService,
    NaijaGigService,
    Skill2CashService,
    FarmgateService,
    AfroHustleService,
    BorderlessRemitService,
    SafeAiService,
    VibeCodersService,
  ],
  exports: [
    ReceiptGeniusService,
    KoloAiService,
    NaijaGigService,
    Skill2CashService,
    FarmgateService,
    AfroHustleService,
    BorderlessRemitService,
    SafeAiService,
  ],
})
export class VillageCircleModule {}
