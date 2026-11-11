import { z } from "zod";

export const BUSINESS_CATEGORIES = ["CLINIC", "BARBER", "TUTOR", "GYM", "OTHER"] as const;

const knownTimezones = new Set(Intl.supportedValuesOf("timeZone"));

// IANA name like "Europe/Berlin"; a typo would silently break every slot calculation.
const timezone = z.string().refine((tz) => knownTimezones.has(tz), "Unknown timezone");

export const createBusinessSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(BUSINESS_CATEGORIES),
  address: z.string().trim().min(1).max(200),
  timezone,
  minNoticeMinutes: z
    .int()
    .min(0)
    .max(7 * 24 * 60)
    .optional(),
  maxDaysAhead: z.int().min(1).max(365).optional(),
  cancelCutoffHours: z.int().min(0).max(168).optional(),
});

// An uploaded image's URL (the API checks it's ours), or null to remove the image.
const imageUrl = z
  .url({ protocol: /^https$/ })
  .nullable()
  .optional();

export const updateBusinessSchema = createBusinessSchema
  .partial()
  .extend({ logoUrl: imageUrl, coverUrl: imageUrl });

export const BUSINESS_IMAGE_KINDS = ["logo", "cover"] as const;

export const createImageUploadSchema = z.object({ kind: z.enum(BUSINESS_IMAGE_KINDS) });

export const listBusinessesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category: z.enum(BUSINESS_CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type ListBusinessesQuery = z.infer<typeof listBusinessesQuerySchema>;
export type BusinessImageKind = (typeof BUSINESS_IMAGE_KINDS)[number];
