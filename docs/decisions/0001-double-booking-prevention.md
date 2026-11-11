# 0001 — Preventing double bookings with a database constraint

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Two customers can ask for the same staff member at the same time within milliseconds of
each other. Checking "is this slot free?" and then inserting is a race: both requests can
pass the check before either inserts. The guarantee "no double bookings under concurrent
requests" is a core requirement.

## Decision

A PostgreSQL **exclusion constraint** on `Booking` (migration `booking_no_overlap`):

- no two rows for the same `staffId` may have overlapping `tstzrange(startsAt, blockedUntil, '[)')`;
- only rows with status `PENDING` or `CONFIRMED` count (a partial constraint), so cancelled
  and expired bookings free their time;
- `blockedUntil = endsAt + buffer`, so cleanup time after a service is protected too;
- `[)` (end not included) lets back-to-back bookings touch without overlapping.

The application still runs the slot calculation first (for good error messages and for
rules the database can't see: working hours, notice, booking window). The constraint has
the final say: a violation (Postgres error `23P01`) becomes `409 SLOT_TAKEN`. For "any
staff", the API tries the next free staff member before giving up.

The same constraint protects **rescheduling**: the booking row is moved in place, and the
constraint compares it only against _other_ rows.

## Alternatives considered

- **Check, then insert:** has the race described above.
- **`SELECT … FOR UPDATE` / advisory locks:** works, but every code path that writes
  bookings must remember to lock; one forgotten path reintroduces the bug.
- **Serializable transactions:** correct, but needs retry logic everywhere and fails more
  often under load.
- **A Redis lock:** a second system that can disagree with the database.

## Consequences

- Correctness doesn't depend on every code path being careful; it holds even for writes
  from a script or a future service.
- Proven by a test: 10 simultaneous requests for one slot give exactly one `201` and nine
  `409`, with one row in the database. A second test races 5 reschedules into one slot.
- The constraint can't see time passing, so unpaid `PENDING` bookings must be expired
  actively (see [0003](0003-job-queue.md)).
- Overlap errors are detected by the Postgres code `23P01`, read from Prisma's driver
  adapter error. If a second exclusion constraint is added, the constraint name must be
  checked too.
