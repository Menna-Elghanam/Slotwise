import type { AdminBusinessesQuery, AdminUsersQuery } from "@booking/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";

/** Platform-wide numbers for the admin dashboard. */
export async function getStats() {
  const [users, businesses, bookings, revenue] = await Promise.all([
    db.user.count(),
    db.business.groupBy({ by: ["status"], _count: { _all: true } }),
    db.booking.groupBy({ by: ["status"], _count: { _all: true } }),
    // Money that stayed with businesses: paid and not refunded.
    db.payment.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
  ]);

  const countBy = (rows: { status: string; _count: { _all: number } }[]) =>
    Object.fromEntries(rows.map((row) => [row.status, row._count._all]));

  return {
    users,
    businesses: countBy(businesses),
    bookings: countBy(bookings),
    paidCents: revenue._sum.amountCents ?? 0,
  };
}

export async function listUsers(query: AdminUsersQuery) {
  const where: Prisma.UserWhereInput = query.search
    ? {
        OR: [
          { email: { contains: query.search, mode: "insensitive" } },
          { name: { contains: query.search, mode: "insensitive" } },
        ],
      }
    : {};

  const [users, total] = await db.$transaction([
    db.user.findMany({
      where,
      // Never the password hash.
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.user.count({ where }),
  ]);

  return { items: users, total, page: query.page, pageSize: query.pageSize };
}

export async function listBusinesses(query: AdminBusinessesQuery) {
  const where: Prisma.BusinessWhereInput = {
    status: query.status,
    name: query.search ? { contains: query.search, mode: "insensitive" } : undefined,
  };

  const [businesses, total] = await db.$transaction([
    db.business.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        status: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { bookings: true, staff: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.business.count({ where }),
  ]);

  return { items: businesses, total, page: query.page, pageSize: query.pageSize };
}

/**
 * A suspended business disappears from discovery and takes no new bookings. Existing
 * bookings are left alone: cancelling them is a decision for a person, not a side effect.
 */
export async function setBusinessStatus(businessId: string, status: "ACTIVE" | "SUSPENDED") {
  const { count } = await db.business.updateMany({ where: { id: businessId }, data: { status } });
  if (count === 0) {
    throw new AppError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }
  return db.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { id: true, name: true, status: true },
  });
}
