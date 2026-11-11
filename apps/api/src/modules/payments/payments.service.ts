import { addMinutes } from "date-fns";
import { scheduleBookingExpiry } from "../../jobs/booking-expiry.js";
import { config } from "../../lib/config.js";
import { db, isUniqueViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { stripe } from "../../lib/stripe.js";

/** Stripe requires at least 30 minutes; one extra covers clock differences. */
export const CHECKOUT_WINDOW_MINUTES = 31;

const notPayable = () => new AppError(409, "NOT_PAYABLE", "This booking can no longer be paid");

/** The payment page URL of a session, as long as the customer can still pay on it. */
async function openSessionUrl(sessionId: string): Promise<string> {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.status !== "open" || !session.url) {
    throw notPayable();
  }
  return session.url;
}

/** Closes a session nobody will use. Best effort: it expires by itself anyway. */
async function expireUnusedSession(sessionId: string): Promise<void> {
  await stripe.checkout.sessions.expire(sessionId).catch((err: unknown) => {
    logger.warn({ err, sessionId }, "Could not expire unused checkout session");
  });
}

/**
 * Starts (or resumes) Stripe Checkout for the customer's PENDING booking. Opening checkout
 * extends the slot hold to the session's lifetime, once: later calls reuse the session.
 */
export async function createCheckout(bookingId: string, userId: string, now = new Date()) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      payment: true,
      service: { select: { name: true } },
      business: { select: { name: true } },
    },
  });
  // 404 rather than 403, like the other booking endpoints.
  if (!booking || booking.customerId !== userId) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (booking.status !== "PENDING" || !booking.expiresAt || booking.expiresAt <= now) {
    throw notPayable();
  }

  if (booking.payment) {
    return { checkoutUrl: await openSessionUrl(booking.payment.stripeCheckoutSessionId) };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: booking.id,
    metadata: { bookingId: booking.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: booking.currency.toLowerCase(),
          unit_amount: booking.priceCents,
          product_data: { name: `${booking.service.name} at ${booking.business.name}` },
        },
      },
    ],
    // Stripe wants Unix seconds.
    expires_at: Math.floor(addMinutes(now, CHECKOUT_WINDOW_MINUTES).getTime() / 1000),
    success_url: `${config.WEB_URL}/bookings/${booking.id}?payment=success`,
    cancel_url: `${config.WEB_URL}/bookings/${booking.id}?payment=cancelled`,
  });
  if (!session.url) {
    throw new Error(`Checkout session ${session.id} has no URL`);
  }
  const expiresAt = new Date(session.expires_at * 1000);

  try {
    await db.$transaction(async (tx) => {
      // Payment.bookingId is unique: if two clicks race, only one session gets saved.
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          stripeCheckoutSessionId: session.id,
          amountCents: booking.priceCents,
          currency: booking.currency,
        },
      });
      // Conditional, so it can't revive a booking that expired while Stripe was answering.
      const { count } = await tx.booking.updateMany({
        where: { id: booking.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { expiresAt },
      });
      if (count === 0) {
        throw notPayable();
      }
    });
  } catch (err) {
    await expireUnusedSession(session.id);
    if (!isUniqueViolation(err)) {
      throw err;
    }
    // The other click won; send this customer to the same payment page.
    const winner = await db.payment.findUniqueOrThrow({ where: { bookingId: booking.id } });
    return { checkoutUrl: await openSessionUrl(winner.stripeCheckoutSessionId) };
  }

  // The original 10-minute job is still queued under the booking id and will find nothing to
  // do, so the extended window needs a job of its own.
  await scheduleBookingExpiry(booking.id, expiresAt, `${booking.id}-checkout`).catch(
    (err: unknown) => {
      logger.error({ err, bookingId: booking.id }, "Could not schedule booking expiry");
    },
  );

  return { checkoutUrl: session.url };
}
