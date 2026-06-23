import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../../common/constants/queues';

// ─── Controllers ─────────────────────────────────────────────────────────────
import { PlanAISuiteController } from './controllers/planai-suite.controller';
import { SocialMediaController } from './controllers/social-media.controller';
import { AdsCenterController } from './controllers/ads-center.controller';
import { BrandHomeController } from './controllers/brand-home.controller';
import {
  BizIntelController,
  InvestorKitController,
  MarketingAutoController,
  BizDirectoryController,
} from './controllers/biz-intel.controller';
import {
  BizAgentController,
  ProjectManagerController,
  PlanCRMController,
  HRPayrollController,
  FitnessCenterController,
  MarketplaceController,
} from './controllers/tools.controller';

// ─── Services ─────────────────────────────────────────────────────────────────
import { PlanAISuiteService } from './services/planai-suite.service';
import { PlanAIJobService } from './services/planai-job.service';
import { SocialMediaService } from './services/social-media.service';
import { AdsCenterService } from './services/ads-center.service';
import { BrandHomeService } from './services/brand-home.service';
import { BizIntelService } from './services/biz-intel.service';
import { InvestorKitService } from './services/investor-kit.service';
import { MarketingAutoService } from './services/marketing-auto.service';
import { BizDirectoryService } from './services/biz-directory.service';
import { BizAgentService } from './services/biz-agent.service';
import { ProjectManagerService } from './services/project-manager.service';
import { PlanCRMService } from './services/plan-crm.service';
import { HRPayrollService } from './services/hr-payroll.service';
import { FitnessCenterService } from './services/fitness-center.service';
import { MarketplaceService } from './services/marketplace.service';
import { MetaWebhookService } from './social-media-manager/metawebhook.service';   // ← ADD


// ─── Processor ────────────────────────────────────────────────────────────────
import { PlanAIJobProcessor } from './processors/planai.processor';

// ─────────────────────────────────────────────────────────────────────────────
// PlanAI queues
//
// AI_GENERATION  — all async PlanAI document jobs (business plan, pitch deck,
//                  branding, storefront, etc.) and the email-scrape fan-out.
//                  Processor: PlanAIJobProcessor (@Processor(QUEUES.AI_GENERATION))
//
// WEBHOOK_DELIVERY — outgoing enterprise webhook fan-out triggered by planai
//                  events (e.g. job completed). Processor lives in the api module;
//                  PlanAIModule registers the queue here only to enqueue, not consume.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
  imports: [
    HttpModule
  ],
  controllers: [
    PlanAISuiteController,
    SocialMediaController,
    AdsCenterController,
    BrandHomeController,
    BizIntelController,
    InvestorKitController,
    MarketingAutoController,
    BizDirectoryController,
    BizAgentController,
    ProjectManagerController,
    PlanCRMController,
    HRPayrollController,
    FitnessCenterController,
    MarketplaceController,
  ],
  providers: [
    PlanAISuiteService,
    PlanAIJobService,
    SocialMediaService,
    MetaWebhookService,        // ← ADD
    AdsCenterService,
    BrandHomeService,
    BizIntelService,
    InvestorKitService,
    MarketingAutoService,
    BizDirectoryService,
    BizAgentService,
    ProjectManagerService,
    PlanCRMService,
    HRPayrollService,
    FitnessCenterService,
    MarketplaceService,
    PlanAIJobProcessor,
  ],
  exports: [
    PlanAISuiteService,
    PlanAIJobService,
    SocialMediaService,
    MarketingAutoService,
    BizAgentService,
  ],
})
export class PlanAIModule {}