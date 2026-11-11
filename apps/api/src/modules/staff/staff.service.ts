import { queueEmail } from "../../jobs/emails.js";
import { db, isUniqueViolation } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { generateToken, hashToken } from "../auth/auth.service.js";
import { assertOwner } from "../businesses/businesses.service.js";
import { staffInviteEmail } from "../notifications/email-templates.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const alreadyStaff = () =>
  new AppError(409, "ALREADY_STAFF", "This person is already a staff member here");

/** Loads a staff member and checks that `userId` owns their business. */
export async function assertStaffOwner(staffId: string, userId: string) {
  const staff = await db.staffMember.findUnique({
    where: { id: staffId },
    include: { business: { select: { ownerId: true } } },
  });
  if (!staff) {
    throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found");
  }
  if (staff.business.ownerId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Only the owner can do this");
  }
  return staff;
}

/** The owner or the staff member themselves may manage this staff member's availability. */
export async function assertCanManageStaff(staffId: string, userId: string) {
  const staff = await db.staffMember.findUnique({
    where: { id: staffId },
    include: { business: { select: { ownerId: true } } },
  });
  if (!staff) {
    throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found");
  }
  if (staff.userId !== userId && staff.business.ownerId !== userId) {
    throw new AppError(403, "FORBIDDEN", "Only the owner or this staff member can do this");
  }
  return staff;
}

/** The solo-business case: the owner also takes bookings themselves. */
export async function addOwnerAsStaff(businessId: string, userId: string) {
  await assertOwner(businessId, userId);
  try {
    return await db.staffMember.create({ data: { businessId, userId } });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(409, "ALREADY_STAFF", "You are already a staff member here");
    }
    throw err;
  }
}

/** Replaces the staff member's whole list of services. */
export async function setStaffServices(staffId: string, userId: string, serviceIds: string[]) {
  const staff = await assertStaffOwner(staffId, userId);

  // Every id must be a service of this same business, or an owner could attach another shop's service.
  const ownServices = await db.service.count({
    where: { id: { in: serviceIds }, businessId: staff.businessId },
  });
  if (ownServices !== serviceIds.length) {
    throw new AppError(400, "INVALID_SERVICES", "Some services don't belong to this business");
  }

  // One transaction, so the list is never left half-replaced.
  await db.$transaction([
    db.staffService.deleteMany({ where: { staffId } }),
    db.staffService.createMany({ data: serviceIds.map((serviceId) => ({ staffId, serviceId })) }),
  ]);

  return { staffId, serviceIds };
}

/** The owner invites someone by email; they join by opening the link while logged in. */
export async function inviteStaff(businessId: string, userId: string, email: string) {
  const business = await assertOwner(businessId, userId);

  const existing = await db.staffMember.count({ where: { businessId, user: { email } } });
  if (existing > 0) {
    throw alreadyStaff();
  }

  const token = generateToken();
  const invite = await db.staffInvite.create({
    data: {
      businessId,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
    select: { id: true, email: true, expiresAt: true, createdAt: true },
  });

  await queueEmail(staffInviteEmail(email, business.name, token)).catch((err: unknown) => {
    logger.error({ err, inviteId: invite.id }, "Could not queue staff invite email");
  });
  return invite;
}

export async function listPendingInvites(businessId: string, userId: string) {
  await assertOwner(businessId, userId);
  return db.staffInvite.findMany({
    where: { businessId, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

const invalidInvite = () =>
  new AppError(400, "INVALID_TOKEN", "This invite is invalid or has expired");

export async function acceptInvite(token: string, userId: string) {
  const invite = await db.staffInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { business: { select: { status: true } } },
  });
  if (!invite || invite.business.status !== "ACTIVE") {
    throw invalidInvite();
  }

  // A forwarded link alone isn't enough: you must be logged in as the invited address.
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.email !== invite.email) {
    throw new AppError(403, "INVITE_EMAIL_MISMATCH", "This invite was sent to another email");
  }

  try {
    return await db.$transaction(async (tx) => {
      // Conditional, so the same link can't be used twice.
      const { count } = await tx.staffInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) {
        throw invalidInvite();
      }
      return tx.staffMember.create({ data: { businessId: invite.businessId, userId } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw alreadyStaff();
    }
    throw err;
  }
}

/**
 * Deactivated staff disappear from the public list and get no new bookings. Refused while
 * they still have upcoming bookings, so no customer is left with a booking nobody serves.
 */
export async function setStaffActive(staffId: string, userId: string, isActive: boolean) {
  await assertStaffOwner(staffId, userId);

  if (!isActive) {
    const upcoming = await db.booking.count({
      where: { staffId, startsAt: { gt: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
    });
    if (upcoming > 0) {
      throw new AppError(
        409,
        "HAS_UPCOMING_BOOKINGS",
        "Cancel or move this staff member's upcoming bookings first",
        { upcomingBookings: upcoming },
      );
    }
  }

  return db.staffMember.update({ where: { id: staffId }, data: { isActive } });
}

/** Public: active staff of an active business, with the active services they perform. */
export async function listActiveStaff(businessId: string) {
  const staff = await db.staffMember.findMany({
    where: { businessId, isActive: true, business: { status: "ACTIVE" } },
    select: {
      id: true,
      user: { select: { name: true } },
      services: { where: { service: { isActive: true } }, select: { serviceId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Only the name is public; the user's id and email stay private.
  return staff.map((s) => ({
    id: s.id,
    name: s.user.name,
    serviceIds: s.services.map((link) => link.serviceId),
  }));
}
