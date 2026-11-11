import { Queue } from "bullmq";
import { subHours } from "date-fns";
import type { EmailMessage } from "../lib/mailer.js";
import { createRedisConnection } from "../lib/redis.js";

export const EMAIL_QUEUE = "emails";

export type EmailJob =
  | { kind: "send"; message: EmailMessage }
  /** Rendered when it runs, so it shows the booking as it is then (or is skipped). */
  | { kind: "reminder"; bookingId: string; startsAt: string };

const queue = new Queue<EmailJob>(EMAIL_QUEUE, { connection: createRedisConnection() });

const retry = {
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
  removeOnFail: 100,
} as const;

/** Sends in the background, so a slow or failing mail server never slows down a request. */
export async function queueEmail(message: EmailMessage): Promise<void> {
  await queue.add("send", { kind: "send", message }, retry);
}

export const REMINDER_HOURS_BEFORE = 24;

/**
 * Schedules the reminder for this exact start time. A rescheduled booking gets a new job;
 * the old one still runs but sees the start time changed and sends nothing.
 */
export async function scheduleReminder(
  bookingId: string,
  startsAt: Date,
  now = new Date(),
): Promise<void> {
  const sendAt = subHours(startsAt, REMINDER_HOURS_BEFORE);
  if (sendAt <= now) {
    // Booked less than a day ahead: the confirmation email is reminder enough.
    return;
  }
  await queue.add(
    "reminder",
    { kind: "reminder", bookingId, startsAt: startsAt.toISOString() },
    {
      ...retry,
      delay: sendAt.getTime() - now.getTime(),
      jobId: reminderJobId(bookingId, startsAt),
    },
  );
}

export function reminderJobId(bookingId: string, startsAt: Date): string {
  return `reminder-${bookingId}-${startsAt.getTime()}`;
}
