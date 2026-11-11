import { Queue, Worker } from "bullmq";
import { db } from "../lib/db.js";
import { reportError } from "../lib/error-tracking.js";
import { logger } from "../lib/logger.js";
import { createRedisConnection } from "../lib/redis.js";

export const QUEUE_NAME = "booking-expiry";

interface BookingExpiryJob {
  bookingId: string;
}

const queue = new Queue<BookingExpiryJob>(QUEUE_NAME, { connection: createRedisConnection() });

/**
 * Schedules the release of an unpaid booking's slot once its payment window ends.
 * Same `jobId` = BullMQ ignores the duplicate, so pass a new one when the window is extended.
 */
export async function scheduleBookingExpiry(
  bookingId: string,
  expiresAt: Date,
  jobId = bookingId,
): Promise<void> {
  await queue.add(
    "expire",
    { bookingId },
    {
      delay: Math.max(0, expiresAt.getTime() - Date.now()),
      jobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

/**
 * Marks the booking EXPIRED if it's still unpaid and past its window.
 * Conditional update: a booking that was paid (CONFIRMED) in the meantime is left alone.
 */
export async function expireBooking(bookingId: string, now = new Date()): Promise<boolean> {
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return count === 1;
}

export function startBookingExpiryWorker(): Worker<BookingExpiryJob> {
  const worker = new Worker<BookingExpiryJob>(
    QUEUE_NAME,
    async (job) => {
      const expired = await expireBooking(job.data.bookingId);
      logger.info({ bookingId: job.data.bookingId, expired }, "Booking expiry job ran");
    },
    { connection: createRedisConnection() },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, bookingId: job?.data.bookingId }, "Booking expiry job failed");
    // Retries are normal; only a job that has given up needs a human.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      reportError(err, { queue: job.queueName, bookingId: job.data.bookingId });
    }
  });
  return worker;
}
