# 0003 — Background jobs with BullMQ, each with a safety net

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

Several things must happen later or outside the request:

- unpaid `PENDING` bookings must release their slot after their payment window;
- emails (confirmation, reminder 24 h before, cancellation, auth links) must be sent
  without making requests slow or failing them when the mail server is down;
- refunds must reach Stripe even if Stripe is briefly unavailable.

## Decision

**BullMQ on Redis**, with three queues: `booking-expiry`, `emails`, `refunds`. Workers run
inside the API process for v1.

Rules every job follows:

- **Idempotent:** running it twice is harmless. Jobs use conditional updates
  (`… WHERE status = 'PENDING'`) and re-check the current state before acting.
- **Deterministic job ids** where duplicates matter (`<bookingId>`, `refund-<paymentId>`,
  `reminder-<bookingId>-<startsAt>`), so BullMQ ignores a second copy. Watch out: when a
  window is _extended_, the new job needs a new id, or BullMQ silently drops it.
- **Retries with exponential backoff**; only a job that has used up its retries is
  reported to Sentry.
- **A safety net for each queue, because Redis can be down when a job is queued:**
  - expiry: slot reads ignore `PENDING` bookings past `expiresAt`, and booking creation
    expires stale ones before inserting;
  - refunds: a repeating "sweep" job (every 15 min) queues every refund that is due;
  - reminders: built when they run, and skipped if the booking was cancelled or moved.
- Queueing failures are logged, never returned to the user: the database change that
  caused the job has already succeeded.

## Alternatives considered

- **Cron + a `status` column scan only:** simpler, but minute-level delays and no retries
  with backoff.
- **Postgres-based queues (pg-boss, graphile-worker):** one system fewer; BullMQ was
  chosen because Redis is needed anyway and it is the most common choice in Node jobs.
- **Sending emails inside the request:** slow, and a mail outage would break sign-up.

## Consequences

- A dead worker can't lock a calendar or lose a refund; it only delays them.
- Workers share the API's process: a CPU-heavy job would slow requests. They can move to
  a separate process (same code, different entry point) when needed.
