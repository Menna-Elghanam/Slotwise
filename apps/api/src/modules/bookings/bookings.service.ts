import type {
  BookingOutcomeInput,
  CreateBookingInput,
  MyBookingsQuery,
  RescheduleBookingInput,
  StaffBookingsQuery,
} from "@booking/shared";
import { addDays, addMinutes, subHours } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { scheduleBookingExpiry } from "../../jobs/booking-expiry.js";
import { scheduleRefund } from "../../jobs/refunds.js";
import { db, isExclusionViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import {
  notifyBookingCancelled,
  notifyBookingRescheduled,
} from "../notifications/notifications.service.js";
import { getAvailableSlots } from "../slots/slots.service.js";
import { assertCanManageStaff } from "../staff/staff.service.js";

/** Statuses that hold a slot and can still be cancelled. */
const ACTIVE_STATUSES = ["PENDING", "CONFIRMED"] as const;

/** How long an unpaid PENDING booking holds its slot. */
export const PAYMENT_WINDOW_MINUTES = 10;

const slotTaken = () =>
  new AppError(409, "SLOT_TAKEN", "This time was just booked, please pick another one");

/**
 * Safety net: if the expiry worker was down, unpaid bookings past their window would still
 * trip the DB constraint (it can't see the clock). Expire them before writing.
 */
async function expireStalePending(staffIds: string[], now: Date) {
  await db.booking.updateMany({
    where: { staffId: { in: staffIds }, status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

export async function createBooking(
  customerId: string,
  input: CreateBookingInput,
  now = new Date(),
) {
  const service = await db.service.findFirst({
    where: { id: input.serviceId, isActive: true, business: { status: "ACTIVE" } },
    include: { business: { select: { id: true, timezone: true } } },
  });
  if (!service) {
    throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  }

  // Re-run the exact calculation the customer saw. This checks working hours, time off,
  // notice, booking window, the 15-min grid and that the staff member offers this service.
  const date = formatInTimeZone(input.startsAt, service.business.timezone, "yyyy-MM-dd");
  const { slots } = await getAvailableSlots(
    service.business.id,
    { serviceId: service.id, staffId: input.staffId, date },
    now,
  );
  const slot = slots.find((s) => s.startsAt === input.startsAt.toISOString());
  if (!slot) {
    throw slotTaken();
  }

  const endsAt = addMinutes(input.startsAt, service.durationMinutes);
  const blockedUntil = addMinutes(endsAt, service.bufferMinutes);

  await expireStalePending(slot.staffIds, now);

  // Another request may grab the same time between the check above and the insert.
  // The database constraint is the real guarantee; for "any staff" try the next free person.
  for (const staffId of slot.staffIds) {
    try {
      const booking = await db.booking.create({
        data: {
          customerId,
          businessId: service.business.id,
          serviceId: service.id,
          staffId,
          startsAt: input.startsAt,
          endsAt,
          blockedUntil,
          // Copied so later service edits don't change this booking.
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          priceCents: service.priceCents,
          currency: service.currency,
          status: "PENDING",
          expiresAt: addMinutes(now, PAYMENT_WINDOW_MINUTES),
        },
      });

      // Don't fail the booking if Redis is down: the safety nets above and in slot
      // calculation still release the slot once the window has passed.
      await scheduleBookingExpiry(booking.id, booking.expiresAt ?? now).catch((err: unknown) => {
        logger.error({ err, bookingId: booking.id }, "Could not schedule booking expiry");
      });

      return booking;
    } catch (err) {
      if (!isExclusionViolation(err)) {
        throw err;
      }
    }
  }

  throw slotTaken();
}

/** The customer's own bookings. "Upcoming" = still active and in the future. */
export async function listMyBookings(customerId: string, query: MyBookingsQuery, now = new Date()) {
  const upcoming = { startsAt: { gte: now }, status: { in: [...ACTIVE_STATUSES] } };

  const bookings = await db.booking.findMany({
    where: { customerId, ...(query.scope === "upcoming" ? upcoming : { NOT: upcoming }) },
    orderBy: { startsAt: query.scope === "upcoming" ? "asc" : "desc" },
    take: 100,
    include: bookingViewInclude,
  });

  return bookings.map(({ staff, ...booking }) => ({ ...booking, staffName: staff.user.name }));
}

/** What a booking page shows: where, what, with whom, and whether it's paid. */
const bookingViewInclude = {
  business: {
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      address: true,
      cancelCutoffHours: true,
      maxDaysAhead: true,
    },
  },
  service: { select: { name: true } },
  staff: { select: { user: { select: { name: true } } } },
  payment: { select: { status: true } },
} as const;

/**
 * One booking, for its customer or the business side (owner or assigned staff member).
 * `viewer` tells the page which actions to offer.
 */
export async function getBooking(bookingId: string, userId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      ...bookingViewInclude,
      business: { select: { ...bookingViewInclude.business.select, ownerId: true } },
      staff: { select: { userId: true, user: { select: { name: true } } } },
      customer: { select: { name: true, email: true } },
    },
  });

  const isCustomer = booking?.customerId === userId;
  const isBusinessSide = booking?.business.ownerId === userId || booking?.staff.userId === userId;
  if (!booking || (!isCustomer && !isBusinessSide)) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const { staff, customer, business, ...rest } = booking;
  return {
    ...rest,
    // Without ownerId: who owns the business isn't the viewer's concern.
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      address: business.address,
      cancelCutoffHours: business.cancelCutoffHours,
      maxDaysAhead: business.maxDaysAhead,
    },
    staffName: staff.user.name,
    // The business side may contact the customer; a customer sees only their own details.
    customer,
    viewer: isBusinessSide ? ("business" as const) : ("customer" as const),
  };
}

/** A staff member's schedule, for the owner or the staff member themselves. */
export async function listStaffBookings(
  staffId: string,
  userId: string,
  query: StaffBookingsQuery,
  now = new Date(),
) {
  await assertCanManageStaff(staffId, userId);
  const from = query.from ?? now;
  const to = query.to ?? addDays(from, 14);

  const bookings = await db.booking.findMany({
    where: {
      staffId,
      startsAt: { gte: from, lt: to },
      // Cancelled and expired bookings don't take up the staff member's time.
      status: { notIn: ["CANCELLED", "EXPIRED"] },
    },
    orderBy: { startsAt: "asc" },
    include: {
      customer: { select: { name: true, email: true } },
      service: { select: { name: true } },
      payment: { select: { status: true } },
    },
  });

  return bookings.map(({ customer, service, ...booking }) => ({
    ...booking,
    customerName: customer.name,
    customerEmail: customer.email,
    serviceName: service.name,
  }));
}

type BookingChange = "cancel" | "reschedule";

const notChangeable = (change: BookingChange) =>
  change === "cancel"
    ? new AppError(409, "NOT_CANCELLABLE", "This booking can no longer be cancelled")
    : new AppError(409, "NOT_RESCHEDULABLE", "This booking can no longer be rescheduled");

/**
 * Loads a booking the user is about to cancel or reschedule, and checks they may.
 * Customers may change a paid booking until the business's cutoff (an unpaid one at any
 * time); the business side (owner or assigned staff member) may change any upcoming booking.
 */
async function loadBookingForChange(
  bookingId: string,
  userId: string,
  change: BookingChange,
  now: Date,
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      business: { select: { ownerId: true, cancelCutoffHours: true, timezone: true } },
      staff: { select: { userId: true } },
    },
  });

  const isCustomer = booking?.customerId === userId;
  const isBusinessSide = booking?.business.ownerId === userId || booking?.staff.userId === userId;

  // 404 rather than 403: bookings are private, so don't confirm that someone else's exists.
  if (!booking || (!isCustomer && !isBusinessSide)) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const isActive = (ACTIVE_STATUSES as readonly string[]).includes(booking.status);
  if (!isActive || booking.startsAt <= now) {
    throw notChangeable(change);
  }

  // The cutoff protects the business from late changes to paid appointments. An unpaid hold
  // isn't a commitment yet: letting the customer release it frees the time sooner.
  const { cancelCutoffHours } = booking.business;
  const pastCutoff = now > subHours(booking.startsAt, cancelCutoffHours);
  if (!isBusinessSide && booking.status === "CONFIRMED" && pastCutoff) {
    const [code, verb] =
      change === "cancel"
        ? ["CANCELLATION_CLOSED", "cancelled"]
        : ["RESCHEDULE_CLOSED", "rescheduled"];
    throw new AppError(
      409,
      code,
      `Bookings can only be ${verb} up to ${cancelCutoffHours} hours before the start`,
    );
  }

  return booking;
}

export async function cancelBooking(bookingId: string, userId: string, now = new Date()) {
  await loadBookingForChange(bookingId, userId, "cancel", now);

  // Conditional update: if a payment or the expiry job changed the status in the meantime,
  // only one of the changes wins.
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: { in: [...ACTIVE_STATUSES] } },
    data: { status: "CANCELLED", cancelledAt: now },
  });
  if (count === 0) {
    throw notChangeable("cancel");
  }

  const payment = await db.payment.findUnique({ where: { bookingId } });
  const refunded = payment?.status === "PAID";
  if (refunded) {
    // If queueing fails, the refund sweep picks it up later.
    await scheduleRefund(payment.id).catch((err: unknown) => {
      logger.error({ err, paymentId: payment.id }, "Could not queue refund");
    });
  }
  await notifyBookingCancelled(bookingId, refunded);

  return db.booking.findUniqueOrThrow({ where: { id: bookingId } });
}

/**
 * Moves a booking to a new time (and optionally another staff member) in place, so its
 * payment stays attached. Price, duration and buffer stay as they were when booked, and a
 * PENDING booking keeps its original payment deadline.
 */
export async function rescheduleBooking(
  bookingId: string,
  userId: string,
  input: RescheduleBookingInput,
  now = new Date(),
) {
  const booking = await loadBookingForChange(bookingId, userId, "reschedule", now);

  const date = formatInTimeZone(input.startsAt, booking.business.timezone, "yyyy-MM-dd");
  const { slots } = await getAvailableSlots(
    booking.businessId,
    { serviceId: booking.serviceId, staffId: input.staffId, date },
    now,
    {
      // Otherwise the booking blocks itself, e.g. moving 10:00 → 10:30 for a 60-min service.
      excludeBookingId: booking.id,
      durationMinutes: booking.durationMinutes,
      bufferMinutes: booking.bufferMinutes,
    },
  );
  const slot = slots.find((s) => s.startsAt === input.startsAt.toISOString());
  if (!slot) {
    throw slotTaken();
  }

  const endsAt = addMinutes(input.startsAt, booking.durationMinutes);
  const blockedUntil = addMinutes(endsAt, booking.bufferMinutes);

  await expireStalePending(slot.staffIds, now);

  for (const staffId of slot.staffIds) {
    try {
      // Conditional, like cancel: a cancel, payment or expiry in the meantime wins.
      const { count } = await db.booking.updateMany({
        where: { id: bookingId, status: { in: [...ACTIVE_STATUSES] } },
        data: { staffId, startsAt: input.startsAt, endsAt, blockedUntil },
      });
      if (count === 0) {
        throw notChangeable("reschedule");
      }
      await notifyBookingRescheduled(bookingId);
      return db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    } catch (err) {
      if (!isExclusionViolation(err)) {
        throw err;
      }
    }
  }

  throw slotTaken();
}

/** The owner or assigned staff member records how a past, paid appointment went. */
export async function recordBookingOutcome(
  bookingId: string,
  userId: string,
  input: BookingOutcomeInput,
  now = new Date(),
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { business: { select: { ownerId: true } }, staff: { select: { userId: true } } },
  });
  const isBusinessSide = booking?.business.ownerId === userId || booking?.staff.userId === userId;
  if (!booking || !isBusinessSide) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const notRecordable = () =>
    new AppError(
      409,
      "OUTCOME_NOT_ALLOWED",
      "Only confirmed bookings that have started can be marked",
    );
  if (booking.startsAt > now) {
    throw notRecordable();
  }
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, status: "CONFIRMED" },
    data: { status: input.status },
  });
  if (count === 0) {
    throw notRecordable();
  }
  return db.booking.findUniqueOrThrow({ where: { id: bookingId } });
}
