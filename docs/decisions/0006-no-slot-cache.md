# 0006 — No Redis cache for available slots (measured)

- **Status:** Accepted
- **Date:** 2026-11-11

## Context

The roadmap planned to cache the slots endpoint in Redis and measure before/after. Slots
are the most-read endpoint, but they change with every booking, cancellation, expiry,
reschedule, working-hours edit, time-off entry and service edit.

## Measurement

A busy business: 5 staff, Monday–Saturday 09:00–18:00, ~2,700 bookings over 60 days
(about half of all slots booked). 300 requests for one day's slots for "any staff",
in-process through the full Express app (HTTP parsing, validation, 4 database queries,
slot calculation), local Postgres:

| p50     | p95     | p99     |
| ------- | ------- | ------- |
| 13.4 ms | 19.5 ms | 27.5 ms |

## Decision

**No cache.** The most a cache could save is roughly 10 ms per request. In exchange, every
one of the seven write paths above would have to invalidate it correctly, and one missed
invalidation shows customers times that are already taken. (The exclusion constraint
would still prevent a double booking, but the customer would hit a `409`.)

## When to revisit

- p95 above ~100 ms in production, or slot queries showing up as a top database load.
- First step then would be query and index work, measured; a cache with a short TTL and
  per-business version keys second.

## Consequences

- Slots are always exactly current.
- 📌 Case-study point: "I planned a cache, measured first, and chose not to add one."
