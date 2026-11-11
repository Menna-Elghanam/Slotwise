import { db } from "../../lib/db.js";

/**
 * Everything the dashboard needs to know about the user's roles in one call: the business
 * they own (with its services and whole team, including deactivated staff), and the
 * businesses where they work as staff.
 */
export async function getWorkspace(userId: string) {
  const [business, staffMemberships] = await Promise.all([
    db.business.findUnique({
      where: { ownerId: userId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        category: true,
        address: true,
        timezone: true,
        logoUrl: true,
        coverUrl: true,
        minNoticeMinutes: true,
        maxDaysAhead: true,
        cancelCutoffHours: true,
        status: true,
        services: {
          where: { isActive: true },
          // Unlike the public list, includes the buffer: only the owner edits it.
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            bufferMinutes: true,
            priceCents: true,
            currency: true,
          },
          orderBy: { name: "asc" },
        },
        staff: {
          select: {
            id: true,
            isActive: true,
            userId: true,
            user: { select: { name: true, email: true } },
            services: { where: { service: { isActive: true } }, select: { serviceId: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.staffMember.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        business: { select: { id: true, name: true, slug: true, timezone: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    business: business && {
      ...business,
      staff: business.staff.map((member) => ({
        id: member.id,
        isActive: member.isActive,
        isOwner: member.userId === userId,
        name: member.user.name,
        email: member.user.email,
        serviceIds: member.services.map((link) => link.serviceId),
      })),
    },
    staffMemberships: staffMemberships.map((membership) => ({
      staffId: membership.id,
      business: membership.business,
    })),
  };
}
