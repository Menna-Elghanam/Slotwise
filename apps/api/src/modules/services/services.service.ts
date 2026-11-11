import type { CreateServiceInput, UpdateServiceInput } from "@booking/shared";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { assertOwner } from "../businesses/businesses.service.js";

const publicServiceSelect = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  priceCents: true,
  currency: true,
} as const;

/** Loads a service and checks that `userId` owns its business. */
async function assertServiceOwner(serviceId: string, userId: string) {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    include: { business: { select: { ownerId: true } } },
  });
  if (!service) {
    throw new AppError(404, "SERVICE_NOT_FOUND", "Service not found");
  }
  if (service.business.ownerId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Only the owner can do this");
  }
  return service;
}

export async function createService(businessId: string, userId: string, input: CreateServiceInput) {
  await assertOwner(businessId, userId);
  return db.service.create({ data: { ...input, businessId } });
}

/** Public: active services of an active business. */
export async function listActiveServices(businessId: string) {
  return db.service.findMany({
    where: { businessId, isActive: true, business: { status: "ACTIVE" } },
    select: publicServiceSelect,
    orderBy: { name: "asc" },
  });
}

export async function updateService(serviceId: string, userId: string, input: UpdateServiceInput) {
  await assertServiceOwner(serviceId, userId);
  // Existing bookings keep their own copied price and duration, so this only affects new ones.
  return db.service.update({ where: { id: serviceId }, data: input });
}

export async function archiveService(serviceId: string, userId: string): Promise<void> {
  await assertServiceOwner(serviceId, userId);
  // Archive instead of delete: past bookings still reference this service.
  await db.service.update({ where: { id: serviceId }, data: { isActive: false } });
}
