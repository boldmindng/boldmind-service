import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES, QUEUE_DEFAULT_JOB_OPTIONS, QueueName } from '../constants/queues';

const queueRegistrations = (Object.values(QUEUES) as QueueName[]).map((name) => ({
  name,
  defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS[name],
}));

@Global()
@Module({
  imports: [BullModule.registerQueue(...queueRegistrations)],
  exports: [BullModule],
})
export class QueuesModule {}