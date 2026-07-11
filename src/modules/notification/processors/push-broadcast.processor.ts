import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import * as webpush from "web-push";
import { PrismaService } from "../../../database/prisma.service";
import { QUEUES, JOBS } from "../../../common/constants/queues";

interface PushBroadcastPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

@Processor(QUEUES.PUSH_NOTIFICATIONS)
export class PushBroadcastProcessor extends WorkerHost {
  private readonly logger = new Logger(PushBroadcastProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(
    job: Job<PushBroadcastPayload>,
  ): Promise<{ sent: number; failed: number }> {
    if (job.name !== JOBS.PUSH.BROADCAST) return { sent: 0, failed: 0 };

    const { title, body, url, icon } = job.data;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { isActive: true },
    });

    const payload = JSON.stringify({
      title,
      body,
      icon: icon ?? "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      url,
    });

    let sent = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as any },
          payload,
        ),
      ),
    );

    await Promise.all(
      results.map(async (r, i) => {
        if (r.status === "fulfilled") {
          sent++;
        } else {
          failed++;
          const statusCode = (r.reason as any)?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: subs[i]!.endpoint },
            });
          }
        }
      }),
    );

    this.logger.log(
      `Push broadcast "${title}": ${sent} sent, ${failed} failed`,
    );
    return { sent, failed };
  }
}
