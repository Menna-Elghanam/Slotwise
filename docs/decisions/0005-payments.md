# 0005 — Payments with Stripe Checkout, confirmed only by webhook

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Customers pay when booking. Card data must not touch our servers, the booking must only
be confirmed once money has really moved, and cancellations of paid bookings must be
refunded.

## Decision

**Flow**

1. `POST /bookings` creates a `PENDING` booking that holds the slot for **10 minutes**.
2. `POST /bookings/:id/checkout` creates a **Stripe Checkout** session (Stripe's hosted
   payment page) and stores a `Payment` row. Opening checkout extends the hold to the
   session's lifetime (**31 minutes**), once; later calls reuse the same session.
3. `POST /webhooks/stripe` with `checkout.session.completed` marks the payment `PAID` and
   the booking `CONFIRMED`. **The webhook is the source of truth**, never the browser
   landing on a success page (it can be closed or faked).
4. Cancelling a paid booking queues a refund (see [0003](0003-job-queue.md)).

**Why 10 + 31 minutes:** Stripe requires a session to stay open for at least 30 minutes
_after it is created_. A fixed 30-minute hold from booking time would be too short if the
customer clicked "Pay" after a few minutes. So: 10 minutes to start paying, then the full
session window. A slot is held for at most ~41 minutes.

**Correctness details**

- **Webhook signature** checked with the raw request body. The route is registered before
  `express.json()`, because parsed-and-reserialized JSON no longer matches the signature.
- **Each event is applied exactly once** ("inbox" pattern): the event id is inserted into
  `StripeEvent` in the same transaction as its effects. A redelivery hits the unique key
  and is skipped; a crash halfway rolls back both, so Stripe's retry processes it again.
- **Double clicks on "Pay":** `Payment.bookingId` is unique, so only one session is saved;
  the losing request returns the winner's URL and expires its own session.
- **Late payments** (the booking expired or was cancelled meanwhile) are refunded
  automatically instead of reviving the booking. Simple and predictable.
- **Refunds** use the idempotency key `refund-<paymentId>`, so Stripe never refunds twice,
  even if we crash between Stripe's answer and our database update.
- **Rescheduling** moves the booking in place, so its payment stays attached.
- Only `sk_test_` keys are accepted by the config: no real money can move in v1.

## Alternatives considered

- **Stripe Payment Element (embedded form):** more control over the look, much more
  frontend work and more PCI scope.
- **Creating the session inside `POST /bookings`:** exact 30-minute window, but booking
  would fail whenever Stripe is down, and every booking test would need Stripe mocked.
- **Stripe's idempotency key for checkout creation:** doesn't work here, because the
  session's `expires_at` differs on every call and Stripe rejects a reused key with
  different parameters.

## Consequences

- Tests never call Stripe: the client is mocked, and webhook tests sign real payloads
  locally with Stripe's SDK.
- Asynchronous payment methods (bank debits) would need `async_payment_succeeded`
  handling; v1 relies on cards.
- Rare Stripe-side refund failures (`refund.failed`) are not handled yet.
