import { z } from "zod";

const page = {
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

export const adminUsersQuerySchema = z.object(page);

export const adminBusinessesQuerySchema = z.object({
  ...page,
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export const updateBusinessStatusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminBusinessesQuery = z.infer<typeof adminBusinessesQuerySchema>;
export type UpdateBusinessStatusInput = z.infer<typeof updateBusinessStatusSchema>;
