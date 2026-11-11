import { Worker } from "bullmq";
import { reportError } from "../lib/error-tracking.js";
import { logger } from "../lib/logger.js";
import { sendEmail } from "../lib/mailer.js";
import { createRedisConnection } from "../lib/redis.js";
import { buildReminder } from "../modules/notifications/notifications.service.js";
import { EMAIL_QUEUE, type EmailJob } from "./emails.js";

/** Sends one queued email. Throwing makes BullMQ retry with backoff. */
export async function processEmailJob(job: EmailJob): Promise<boolean> {
  const message =
    job.kind === "send" ? job.message : await buildReminder(job.bookingId, job.startsAt);
  if (!message) {
    return false;
  }
  await sendEmail(message);
  return true;
}

export function startEmailWorker(): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      const sent = await processEmailJob(job.data);
      // Never log the message itself: it can contain login and reset links.
      logger.info({ jobId: job.id, kind: job.data.kind, sent }, "Email job ran");
    },
    { connection: createRedisConnection() },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "Email job failed");
    // Retries are normal; only a job that has given up needs a human.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      reportError(err, { queue: job.queueName, jobId: job.id });
    }
  });
  return worker;
}
