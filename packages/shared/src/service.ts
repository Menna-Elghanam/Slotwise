import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  durationMinutes: z.int().min(5).max(480),
  bufferMinutes: z.int().min(0).max(120).optional(),
  // Stripe rejects card payments below 0.50, and v1 has no free services.
  priceCents: z.int().min(50).max(1_000_000),
});

export const updateServiceSchema = createServiceSchema.partial();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
