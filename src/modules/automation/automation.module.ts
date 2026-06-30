import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { SocialPostProcessor } from './queue/social-post.processor';
import { EmailCampaignProcessor } from './queue/email-campaign.processor';
import { AIJobsProcessor } from './queue/ai-jobs.processor';

@Module({
  imports: [
   
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    SocialPostProcessor,
    EmailCampaignProcessor,
    AIJobsProcessor,
  ],
  exports: [AutomationService],
})
export class AutomationModule {}