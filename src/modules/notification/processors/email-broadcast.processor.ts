import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../../../database/prisma.service";
import { NotificationService } from "../notification.service";
import { QUEUES, JOBS } from "../../../common/constants/queues";

interface EmailBroadcastPayload {
  subject: string;
  html: string;
  segment: "all" | "pro" | "free";
}

@Processor(QUEUES.EMAIL_NOTIFICATIONS)
export class EmailBroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailBroadcastProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {
    super();
  }

  async process(
    job: Job<EmailBroadcastPayload>,
  ): Promise<{ sent: number; failed: number }> {
    if (job.name !== JOBS.EMAIL.BROADCAST) return { sent: 0, failed: 0 };

    const { subject, html, segment } = job.data;
    const where =
      segment === "pro"
        ? {
            subscriptions: {
              some: { status: { in: ["ACTIVE", "TRIAL"] as any } },
            },
          }
        : segment === "free"
          ? {
              subscriptions: {
                none: { status: { in: ["ACTIVE", "TRIAL"] as any } },
              },
            }
          : {};

    const recipients = await this.prisma.user.findMany({
      where: { isActive: true, ...where },
      select: { id: true, email: true },
    });

    let sent = 0;
    let failed = 0;

    for (const user of recipients) {
      try {
        await this.notifications.sendEmail({
          userId: user.id,
          to: user.email,
          subject,
          html,
        });
        sent++;
      } catch (err) {
        failed++;
        this.logger.warn(
          `Broadcast email failed for ${user.email}: ${err instanceof Error ? err.message : err}`,
        );
      }
      await job.updateProgress(
        Math.round(((sent + failed) / recipients.length) * 100),
      );
    }

    return { sent, failed };
  }
}
