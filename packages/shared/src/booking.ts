import { z } from "zod";

export const createBookingSchema = z.object({
  serviceId: z.uuid(),
  /** Omit for "any available staff". */
  staffId: z.uuid().optional(),
  /** Exact start time as returned by the slots endpoint. */
  startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
});

/** Same service, new time; the staff member may change. */
export const rescheduleBookingSchema = createBookingSchema.omit({ serviceId: true });

/** What happened at a past appointment, recorded by the business. */
export const bookingOutcomeSchema = z.object({ status: z.enum(["COMPLETED", "NO_SHOW"]) });

export const myBookingsQuerySchema = z.object({
  scope: z.enum(["upcoming", "past"]).default("upcoming"),
});

export const staffBookingsQuerySchema = z.object({
  /** Defaults to now. */
  from: z.iso
    .datetime({ offset: true })
    .transform((s) => new Date(s))
    .optional(),
  /** Defaults to 14 days after `from`. */
  to: z.iso
    .datetime({ offset: true })
    .transform((s) => new Date(s))
    .optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;
export type BookingOutcomeInput = z.infer<typeof bookingOutcomeSchema>;
export type MyBookingsQuery = z.infer<typeof myBookingsQuerySchema>;
export type StaffBookingsQuery = z.infer<typeof staffBookingsQuerySchema>;
