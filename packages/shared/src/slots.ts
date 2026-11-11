import { z } from "zod";

export const slotsQuerySchema = z.object({
  serviceId: z.uuid(),
  /** Omit for "any available staff". */
  staffId: z.uuid().optional(),
  /** Local date in the business's timezone, e.g. "2027-07-05". */
  date: z.iso.date(),
});

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
