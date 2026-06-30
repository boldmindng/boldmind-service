import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../database/prisma.service';
import { RedisService } from '../../../database/redis.service';
import { PlanAIJobStatus, PlanAIJobType } from '@prisma/client';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS } from '../../../common/constants/queues';
import { JOB_PRIORITY, PlanAIJobResult } from '../planai.types';
import { CreateJobDto, JobQueryDto } from '../dto/all-planai.dto';

@Injectable()
export class PlanAIJobService {
  private readonly logger = new Logger(PlanAIJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(QUEUES.AI_GENERATION) private readonly queue: Queue,
  ) {}

  // ─── Create & enqueue ────────────────────────────────────────────────────────

  async createJob(userId: string, dto: CreateJobDto): Promise<PlanAIJobResult> {
    const dbJob = await this.prisma.planAIJob.create({
      data: {
        userId,
        type: dto.type,
        status: PlanAIJobStatus.QUEUED,
        productSlug: dto.productSlug ?? 'planai',
        input: dto.input as unknown as {},
        metadata: dto.templateId ? { templateId: dto.templateId } : undefined,
      },
    });

    const priority = JOB_PRIORITY[dto.type] ?? 5;

    // Use centralised default job options for the AI_GENERATION queue,
    // overriding with priority and jobId.
    const jobOptions = {
      ...QUEUE_DEFAULT_JOB_OPTIONS[QUEUES.AI_GENERATION],
      priority,
      jobId: dbJob.id,
    };

    const bullJob = await this.queue.add(
      dto.type, // job name = PlanAIJobType (e.g. BUSINESS_PLAN)
      { jobId: dbJob.id, userId, input: dto.input, type: dto.type },
      jobOptions,
    );

    await this.prisma.planAIJob.update({
      where: { id: dbJob.id },
      data: { bullJobId: bullJob.id as string },
    });

    // Cache job status for fast polling
    await this.redis.setex(
      `planai:job:${dbJob.id}`,
      300,
      JSON.stringify({ status: PlanAIJobStatus.QUEUED, type: dto.type }),
    );

    this.logger.log(`Job queued [${dto.type}] id=${dbJob.id} user=${userId} priority=${priority}`);

    return { jobId: dbJob.id, type: dto.type, status: PlanAIJobStatus.QUEUED };
  }

  // ─── Poll status (Redis-first for speed) ─────────────────────────────────────

  async getJob(userId: string, jobId: string): Promise<PlanAIJobResult> {
    // Fast path: check Redis cache
    const cached = await this.redis.get(`planai:job:${jobId}`);
    if (cached) {
      const parsed = JSON.parse(cached) as { status: PlanAIJobStatus; type: PlanAIJobType };
      if (parsed.status === PlanAIJobStatus.QUEUED || parsed.status === PlanAIJobStatus.PROCESSING) {
        return { jobId, type: parsed.type, status: parsed.status };
      }
    }

    const job = await this.prisma.planAIJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      output: job.output as Record<string, unknown> | undefined,
      outputFileUrl: job.outputFileUrl ?? undefined,
      error: job.errorMessage ?? undefined,
      processingMs: job.processingMs ?? undefined,
    };
  }

  // ─── List with pagination ─────────────────────────────────────────────────────

  async listJobs(userId: string, query: JobQueryDto) {
    const { type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where = { userId, ...(type ? { type } : {}) };

    const [jobs, total] = await Promise.all([
      this.prisma.planAIJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true, type: true, status: true, productSlug: true,
          outputFileUrl: true, errorMessage: true, processingMs: true,
          createdAt: true, completedAt: true,
        },
      }),
      this.prisma.planAIJob.count({ where }),
    ]);

    return {
      data: jobs,
      meta: {
        total, page, limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  // ─── Retry ────────────────────────────────────────────────────────────────────

  async retryJob(userId: string, jobId: string): Promise<PlanAIJobResult> {
    const job = await this.prisma.planAIJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status !== PlanAIJobStatus.FAILED) {
      throw new BadRequestException(`Job ${jobId} is in ${job.status} state — only FAILED jobs can be retried`);
    }

    await this.prisma.planAIJob.update({
      where: { id: jobId },
      data: { status: PlanAIJobStatus.QUEUED, retryCount: { increment: 1 }, errorMessage: null },
    });

    const priority = JOB_PRIORITY[job.type] ?? 5;
    const jobOptions = {
      ...QUEUE_DEFAULT_JOB_OPTIONS[QUEUES.AI_GENERATION],
      priority,
      jobId: `${job.id}-r${job.retryCount + 1}`,
    };

    await this.queue.add(
      job.type,
      { jobId: job.id, userId, input: job.input, type: job.type },
      jobOptions,
    );

    await this.redis.setex(
      `planai:job:${jobId}`,
      300,
      JSON.stringify({ status: PlanAIJobStatus.QUEUED, type: job.type }),
    );

    return { jobId: job.id, type: job.type, status: PlanAIJobStatus.QUEUED };
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  async cancelJob(userId: string, jobId: string): Promise<{ message: string }> {
    const job = await this.prisma.planAIJob.findFirst({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (job.status === PlanAIJobStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed job');
    }

    if (job.bullJobId) {
      const bullJob = await this.queue.getJob(job.bullJobId);
      if (bullJob) await bullJob.remove().catch(() => {}); // non-critical
    }

    await this.prisma.planAIJob.update({
      where: { id: jobId },
      data: { status: PlanAIJobStatus.CANCELLED },
    });

    await this.redis.del(`planai:job:${jobId}`);
    return { message: `Job ${jobId} cancelled` };
  }

  // ─── Internal helpers for the processor ──────────────────────────────────────

  async markProcessing(jobId: string): Promise<void> {
    await Promise.all([
      this.prisma.planAIJob.update({
        where: { id: jobId },
        data: { status: PlanAIJobStatus.PROCESSING, startedAt: new Date() },
      }),
      this.redis.setex(
        `planai:job:${jobId}`,
        300,
        JSON.stringify({ status: PlanAIJobStatus.PROCESSING }),
      ),
    ]);
  }

  async markCompleted(
    jobId: string,
    output: Record<string, unknown>,
    extra: {
      outputFileUrl?: string;
      promptTokens?: number;
      completionTokens?: number;
      processingMs?: number;
      modelUsed?: string;
    } = {},
  ): Promise<void> {
    await this.prisma.planAIJob.update({
      where: { id: jobId },
      data: {
        status: PlanAIJobStatus.COMPLETED,
        output: output as unknown as {},
        completedAt: new Date(),
        outputFileUrl: extra.outputFileUrl,
        promptTokens: extra.promptTokens,
        completionTokens: extra.completionTokens,
        processingMs: extra.processingMs,
        modelUsed: extra.modelUsed,
      },
    });
    await this.redis.del(`planai:job:${jobId}`);
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.prisma.planAIJob.update({
      where: { id: jobId },
      data: { status: PlanAIJobStatus.FAILED, errorMessage },
    });
    await this.redis.del(`planai:job:${jobId}`);
  }

  // ─── Queue health ─────────────────────────────────────────────────────────────

  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  }
}