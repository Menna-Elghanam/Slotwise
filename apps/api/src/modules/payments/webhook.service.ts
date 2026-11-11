import type Stripe from "stripe";
import type { Prisma } from "../../generated/prisma/client.js";
import { scheduleRefund } from "../../jobs/refunds.js";
import { config } from "../../lib/config.js";
import { db, isUniqueViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { stripe } from "../../lib/stripe.js";
import { notifyBookingConfirmed } from "../notifications/notifications.service.js";

/** Checks the request really came from Stripe. Needs the body exactly as it was sent. */
export function verifyStripeEvent(rawBody: Buffer, signature: string): Stripe.Event {
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw new AppError(400, "INVALID_SIGNATURE", "Webhook signature verification failed");
  }
}

class DuplicateEventError extends Error {}

/** What a paid checkout led to; side effects (queues) run only after the transaction commits. */
type CheckoutOutcome =
  | { kind: "confirmed"; bookingId: string }
  | { kind: "late"; paymentId: string }
  | { kind: "ignored" };

/**
 * Applies a Stripe event exactly once. The event id is recorded in the same transaction as
 * its effects: a duplicate delivery is skipped, and a failure rolls back both, so Stripe's
 * retry processes the event again.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  let outcome: CheckoutOutcome = { kind: "ignored" };
  try {
    await db.$transaction(async (tx) => {
      await tx.stripeEvent
        .create({ data: { id: event.id, type: event.type } })
        .catch((err: unknown) => {
          throw isUniqueViolation(err) ? new DuplicateEventError() : err;
        });

      if (event.type === "checkout.session.completed") {
        outcome = await handleCheckoutCompleted(tx, event.data.object);
      } else if (event.type === "checkout.session.expired") {
        await tx.payment.updateMany({
          where: { stripeCheckoutSessionId: event.data.object.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
      }
    });
  } catch (err) {
    if (err instanceof DuplicateEventError) {
      logger.info({ eventId: event.id }, "Skipping already processed Stripe event");
      return;
    }
    throw err;
  }

  await runSideEffects(outcome);
}

/** Queue failures are logged, not thrown: the database change is already committed. */
async function runSideEffects(outcome: CheckoutOutcome): Promise<void> {
  if (outcome.kind === "confirmed") {
    await notifyBookingConfirmed(outcome.bookingId);
  } else if (outcome.kind === "late") {
    // The refund sweep is the safety net if this fails.
    await scheduleRefund(outcome.paymentId).catch((err: unknown) => {
      logger.error({ err, paymentId: outcome.paymentId }, "Could not queue refund");
    });
  }
}

async function handleCheckoutCompleted(
  tx: Prisma.TransactionClient,
  session: Stripe.Checkout.Session,
): Promise<CheckoutOutcome> {
  // Cards are paid by now; other methods (e.g. bank debits) only report "unpaid" here.
  if (session.payment_status !== "paid") {
    return { kind: "ignored" };
  }

  const payment = await tx.payment.findUnique({ where: { stripeCheckoutSessionId: session.id } });
  if (!payment) {
    // E.g. a test event from the Stripe CLI. Not ours, so nothing to do.
    logger.warn({ sessionId: session.id }, "Completed checkout session has no payment");
    return { kind: "ignored" };
  }

  const paymentIntent = session.payment_intent;
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      // Needed later to refund.
      stripePaymentIntentId: typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id,
    },
  });

  // Conditional: a booking that expired or was cancelled meanwhile stays that way.
  const { count } = await tx.booking.updateMany({
    where: { id: payment.bookingId, status: "PENDING" },
    data: { status: "CONFIRMED", expiresAt: null },
  });
  if (count === 0) {
    logger.warn({ bookingId: payment.bookingId }, "Payment arrived too late; refunding");
    return { kind: "late", paymentId: payment.id };
  }
  return { kind: "confirmed", bookingId: payment.bookingId };
}
