-- Prevent double-booking at the database level: two active bookings for the same staff
-- member can never overlap in time, even when requests arrive at the same moment.
-- Prisma can't express exclusion constraints, so this migration is written by hand.

-- Lets a GiST index compare plain values (staffId) with `=` alongside the range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist (
    "staffId" WITH =,
    -- '[)' = start included, end excluded, so back-to-back bookings (10:00-10:30, 10:30-11:00) are allowed.
    tstzrange("startsAt", "blockedUntil", '[)') WITH &&
  )
  -- Only active bookings hold a slot; cancelled or expired ones free it.
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));
