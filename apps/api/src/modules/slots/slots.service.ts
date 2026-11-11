import type { SlotsQuery } from "@booking/shared";
import { addMinutes } from "date-fns";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { calculateSlots, localTimeToUtc } from "./slots.calculator.js";

export interface Slot {
  startsAt: string;
  /** Staff members free at this time; "any staff" bookings pick one of them. */
  staffIds: string[];
}

/** Used by rescheduling, so a booking being moved is checked against the right rules. */
export interface SlotOptions {
  /** Ignore this booking, so it doesn't block its own new time. */
  excludeBookingId?: string;
  /** The booking's saved length, in case the service has been edited since it was booked. */
  durationMinutes?: number;
  bufferMinutes?: number;
}

export async function getAvailableSlots(
  businessId: string,
  query: SlotsQuery,
  now = new Date(),
  options: SlotOptions = {},
) {
  const service = await db.service.findFirst({
    where: { id: query.serviceId, businessId, isActive: true, business: { status: "ACTIVE" } },
    include: { business: true },
  });
  if (!service) {
    throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  }
  const { business } = service;
  const durationMinutes = options.durationMinutes ?? service.durationMinutes;
  const bufferMinutes = options.bufferMinutes ?? service.bufferMinutes;

  // Only active staff who perform this service (optionally one specific person).
  const staff = await db.staffMember.findMany({
    where: {
      businessId,
      id: query.staffId,
      isActive: true,
      services: { some: { serviceId: service.id } },
    },
    select: { id: true, workingHours: true },
    // Stable order, so `staffIds` in each slot is deterministic.
    orderBy: { createdAt: "asc" },
  });
  if (query.staffId && staff.length === 0) {
    throw new AppError(404, "STAFF_NOT_FOUND", "This staff member doesn't offer this service");
  }

  // Load everything that could overlap this local day; a slot near midnight can run past it.
  const dayStart = localTimeToUtc(query.date, 0, business.timezone);
  const searchEnd = addMinutes(
    localTimeToUtc(query.date, 24 * 60, business.timezone),
    durationMinutes + bufferMinutes,
  );
  const staffIds = staff.map((s) => s.id);

  const [bookings, timeOff] = await Promise.all([
    db.booking.findMany({
      where: {
        staffId: { in: staffIds },
        id: options.excludeBookingId ? { not: options.excludeBookingId } : undefined,
        // Confirmed bookings, plus unpaid ones still inside their payment window. An unpaid
        // booking past its window counts as free even if the expiry job hasn't run yet.
        OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: now } }],
        startsAt: { lt: searchEnd },
        blockedUntil: { gt: dayStart },
      },
      select: { staffId: true, startsAt: true, blockedUntil: true },
    }),
    db.timeOff.findMany({
      where: { staffId: { in: staffIds }, startsAt: { lt: searchEnd }, endsAt: { gt: dayStart } },
      select: { staffId: true, startsAt: true, endsAt: true },
    }),
  ]);

  const staffByStart = new Map<string, string[]>();
  for (const member of staff) {
    const busy = [
      ...bookings
        .filter((b) => b.staffId === member.id)
        .map((b) => ({ startsAt: b.startsAt, endsAt: b.blockedUntil })),
      ...timeOff.filter((t) => t.staffId === member.id),
    ];

    const memberSlots = calculateSlots({
      date: query.date,
      timezone: business.timezone,
      durationMinutes,
      bufferMinutes,
      now,
      minNoticeMinutes: business.minNoticeMinutes,
      maxDaysAhead: business.maxDaysAhead,
      workingHours: member.workingHours,
      busy,
    });

    for (const start of memberSlots) {
      const key = start.toISOString();
      staffByStart.set(key, [...(staffByStart.get(key) ?? []), member.id]);
    }
  }

  const slots: Slot[] = [...staffByStart.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsAt, ids]) => ({ startsAt, staffIds: ids }));

  return { date: query.date, timezone: business.timezone, slots };
}
