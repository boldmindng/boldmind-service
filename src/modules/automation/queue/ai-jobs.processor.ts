// src/modules/automation/queue/ai-jobs.processor.ts
//
// Migrated from @nestjs/bull → @nestjs/bullmq for consistency with the rest of
// the codebase (notification.service.ts already used bullmq; the queue stack
// is bullmq ^5.x per system design §1.2). Queue name no longer hardcoded as
// 'ai-jobs' — it now reads QUEUES.AI_GENERATION ('ai-generation'), matching the
// canonical queue map (system-design-v2 §13: ai-generation ← this file).

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUES, JOBS } from '../../../common/constants/queues';

interface EmailScrapeJobData {
  userId: string;
  targetUrl?: string;
  linkedinSearchQuery?: string;
  naijaDirectory?: string;
  limit?: number;
}

@Processor(QUEUES.AI_GENERATION)
export class AIJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(AIJobsProcessor.name);

  async process(job: Job<EmailScrapeJobData>): Promise<any> {
    switch (job.name) {
      case JOBS.AI.EMAIL_SCRAPE:
        return this.handleEmailScrape(job);
      default:
        this.logger.warn(`Unhandled job "${job.name}" on queue "${QUEUES.AI_GENERATION}"`);
        return null;
    }
  }

  private async handleEmailScrape(job: Job<EmailScrapeJobData>) {
    const { targetUrl, limit = 50 } = job.data;
    this.logger.log(`Email scrape job started for user ${job.data.userId}`);

    const emails: string[] = [];

    if (targetUrl) {
      try {
        // Simple email extraction from webpage
        const { data } = await axios.get(targetUrl, { timeout: 10000 });
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const found = data.match(emailRegex) || [];
        emails.push(...found.slice(0, limit));
      } catch (err: any) {
        this.logger.warn(`Scrape failed for ${targetUrl}:`, err.message);
      }
    }

    // Deduplicate + filter disposable domains
    const disposable = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'throwaway.email'];
    const unique = [...new Set(emails)].filter(
      (e) => !disposable.some((d) => e.includes(d)),
    );

    this.logger.log(`Email scrape complete: found ${unique.length} emails`);
    return { emails: unique, count: unique.length };
  }
}