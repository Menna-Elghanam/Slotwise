import { Queue, Worker } from "bullmq";
import { db } from "../lib/db.js";
import { reportError } from "../lib/error-tracking.js";
import { logger } from "../lib/logger.js";
import { createRedisConnection } from "../lib/redis.js";
import { stripe } from "../lib/stripe.js";

export const REFUND_QUEUE = "refunds";

/** How often the safety net looks for refunds that were never queued (e.g. Redis was down). */
const SWEEP_EVERY_MS = 15 * 60 * 1000;

interface RefundJob {
  paymentId?: string;
}

const queue = new Queue<RefundJob>(REFUND_QUEUE, { connection: createRedisConnection() });

/** A paid booking that no longer happens gets its money back. */
const REFUNDABLE_BOOKING_STATUSES = ["CANCELLED", "EXPIRED"] as const;

/** Queues a refund. Retries with backoff, so a Stripe outage only delays it. */
export async function scheduleRefund(paymentId: string): Promise<void> {
  await queue.add(
    "refund",
    { paymentId },
    {
      jobId: `refund-${paymentId}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

/**
 * Refunds a payment whose booking was cancelled or expired. Safe to run more than once:
 * it skips anything not due, and the idempotency key stops Stripe refunding twice even if
 * we crash between Stripe's answer and our update.
 */
export async function refundPayment(paymentId: string, now = new Date()): Promise<boolean> {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { select: { status: true } } },
  });
  const isDue =
    payment?.status === "PAID" &&
    (REFUNDABLE_BOOKING_STATUSES as readonly string[]).includes(payment.booking.status);
  if (!payment || !isDue) {
    return false;
  }
  if (!payment.stripePaymentIntentId) {
    throw new Error(`Paid payment ${payment.id} has no payment intent`);
  }

  await stripe.refunds.create(
    { payment_intent: payment.stripePaymentIntentId },
    { idempotencyKey: `refund-${payment.id}` },
  );
  await db.payment.updateMany({
    where: { id: payment.id, status: "PAID" },
    data: { status: "REFUNDED", refundedAt: now },
  });
  return true;
}

/** Safety net: queues every refund that is due but was never queued. */
export async function queueDueRefunds(): Promise<number> {
  const due = await db.payment.findMany({
    where: { status: "PAID", booking: { status: { in: [...REFUNDABLE_BOOKING_STATUSES] } } },
    select: { id: true },
  });
  await Promise.all(due.map((payment) => scheduleRefund(payment.id)));
  return due.length;
}

export async function startRefundWorker(): Promise<Worker<RefundJob>> {
  // Upsert: restarting the API doesn't add a second schedule.
  await queue.upsertJobScheduler("refund-sweep", { every: SWEEP_EVERY_MS }, { name: "sweep" });

  const worker = new Worker<RefundJob>(
    REFUND_QUEUE,
    async (job) => {
      if (job.name === "sweep") {
        const queued = await queueDueRefunds();
        logger.info({ queued }, "Refund sweep ran");
        return;
      }
      if (job.data.paymentId) {
        const refunded = await refundPayment(job.data.paymentId);
        logger.info({ paymentId: job.data.paymentId, refunded }, "Refund job ran");
      }
    },
    { connection: createRedisConnection() },
  );
  worker.on("failed", (job, err) => {
    logger.error({ err, paymentId: job?.data.paymentId }, "Refund job failed");
    // Retries are normal; only a job that has given up needs a human.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      reportError(err, { queue: job.queueName, paymentId: job.data.paymentId });
    }
  });
  return worker;
}
