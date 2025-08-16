// src/worker.ts
import { Worker } from 'bullmq';
import { sampler } from './sampler';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

const worker = new Worker('sampling-jobs', sampler, {
  connection: { url: REDIS_URL },
});

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

console.log('[Worker] Address Sampler worker running…');
