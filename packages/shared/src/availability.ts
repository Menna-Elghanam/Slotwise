import { z } from "zod";

const MINUTES_PER_DAY = 24 * 60;

/** One working range on one weekday, in the business's local time. 09:00 = 540. */
const workingHoursRangeSchema = z
  .object({
    dayOfWeek: z.int().min(0).max(6), // 0 = Sunday
    startMinute: z
      .int()
      .min(0)
      .max(MINUTES_PER_DAY - 1),
    endMinute: z.int().min(1).max(MINUTES_PER_DAY),
  })
  .refine((r) => r.endMinute > r.startMinute, {
    message: "End must be after start",
    path: ["endMinute"],
  });

export const setWorkingHoursSchema = z
  .object({ ranges: z.array(workingHoursRangeSchema).max(50) })
  .superRefine(({ ranges }, ctx) => {
    // Sort by day then start, so an overlap can only be between neighbours.
    const sorted = [...ranges].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute,
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev && curr && prev.dayOfWeek === curr.dayOfWeek && curr.startMinute < prev.endMinute) {
        ctx.addIssue({
          code: "custom",
          message: "Ranges overlap on the same day",
          path: ["ranges"],
        });
        return;
      }
    }
  });

export const createTimeOffSchema = z
  .object({
    // Exact moments with an offset, e.g. "2027-12-24T00:00:00+01:00"; stored as UTC.
    startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    endsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((t) => t.endsAt > t.startsAt, { message: "End must be after start", path: ["endsAt"] });

export type SetWorkingHoursInput = z.infer<typeof setWorkingHoursSchema>;
export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>;
