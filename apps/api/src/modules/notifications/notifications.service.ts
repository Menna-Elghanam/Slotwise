import { queueEmail, scheduleReminder } from "../../jobs/emails.js";
import { db } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { EmailMessage } from "../../lib/mailer.js";
import {
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingReminderEmail,
  bookingRescheduledEmail,
  type BookingEmailDetails,
} from "./email-templates.js";

async function loadBookingEmailDetails(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: { select: { name: true, email: true } },
      business: { select: { name: true, address: true, timezone: true } },
      service: { select: { name: true } },
      staff: { select: { user: { select: { name: true } } } },
    },
  });
  if (!booking) {
    return null;
  }
  const details: BookingEmailDetails = {
    bookingId: booking.id,
    customerName: booking.customer.name,
    customerEmail: booking.customer.email,
    businessName: booking.business.name,
    businessAddress: booking.business.address,
    timezone: booking.business.timezone,
    serviceName: booking.service.name,
    staffName: booking.staff.user.name,
    startsAt: booking.startsAt,
  };
  return { status: booking.status, details };
}

/**
 * Notifications never fail the action that caused them: the booking change is already
 * saved, so a queue problem is logged instead of turned into an error for the user.
 */
async function safely(what: string, bookingId: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (err) {
    logger.error({ err, bookingId }, `Could not queue ${what}`);
  }
}

export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  await safely("confirmation email", bookingId, async () => {
    const booking = await loadBookingEmailDetails(bookingId);
    if (!booking) {
      return;
    }
    await queueEmail(bookingConfirmedEmail(booking.details));
    await scheduleReminder(bookingId, booking.details.startsAt);
  });
}

/** Only paid bookings: an unpaid one gets its confirmation once it's paid. */
export async function notifyBookingRescheduled(bookingId: string): Promise<void> {
  await safely("reschedule email", bookingId, async () => {
    const booking = await loadBookingEmailDetails(bookingId);
    if (booking?.status !== "CONFIRMED") {
      return;
    }
    await queueEmail(bookingRescheduledEmail(booking.details));
    await scheduleReminder(bookingId, booking.details.startsAt);
  });
}

export async function notifyBookingCancelled(bookingId: string, refunded: boolean): Promise<void> {
  await safely("cancellation email", bookingId, async () => {
    const booking = await loadBookingEmailDetails(bookingId);
    if (!booking) {
      return;
    }
    await queueEmail(bookingCancelledEmail(booking.details, refunded));
  });
}

/**
 * Builds the reminder when its job runs. Returns null when it no longer applies: the booking
 * was cancelled, or moved (its start time differs from the one this reminder was made for).
 */
export async function buildReminder(
  bookingId: string,
  startsAt: string,
): Promise<EmailMessage | null> {
  const booking = await loadBookingEmailDetails(bookingId);
  if (booking?.status !== "CONFIRMED" || booking.details.startsAt.toISOString() !== startsAt) {
    return null;
  }
  return bookingReminderEmail(booking.details);
}
