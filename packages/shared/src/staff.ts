import { z } from "zod";

export const setStaffServicesSchema = z.object({
  // Duplicates are dropped so the same service can't be assigned twice.
  serviceIds: z
    .array(z.uuid())
    .max(100)
    .transform((ids) => [...new Set(ids)]),
});

export type SetStaffServicesInput = z.infer<typeof setStaffServicesSchema>;

export const createStaffInviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const acceptStaffInviteSchema = z.object({ token: z.string().min(20).max(200) });

export const updateStaffSchema = z.object({ isActive: z.boolean() });

export type CreateStaffInviteInput = z.infer<typeof createStaffInviteSchema>;
export type AcceptStaffInviteInput = z.infer<typeof acceptStaffInviteSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
