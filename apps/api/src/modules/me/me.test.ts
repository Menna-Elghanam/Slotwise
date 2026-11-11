import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { app, bookableBusiness, loggedInAgent } from "../../test/helpers.js";

beforeEach(async () => {
  await resetDb();
});

describe("GET /me/workspace", () => {
  it("gives the owner their business with services (incl. buffer) and the whole team", async () => {
    const { agent, business, service, staff } = await bookableBusiness();
    await db.staffMember.update({ where: { id: staff.id }, data: { isActive: false } });

    const res = await agent.get("/me/workspace");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      business: {
        id: business.id,
        status: "ACTIVE",
        services: [{ id: service.id, bufferMinutes: 0 }],
        staff: [
          {
            id: staff.id,
            isActive: false,
            isOwner: true,
            email: "owner@example.com",
            serviceIds: [service.id],
          },
        ],
      },
      // Deactivated memberships don't count as a workplace.
      staffMemberships: [],
    });
  });

  it("lists where a staff member works, and nothing for a plain customer", async () => {
    const { business } = await bookableBusiness();
    const barber = await loggedInAgent("barber@example.com");
    const barberUser = await db.user.findUniqueOrThrow({ where: { email: "barber@example.com" } });
    const membership = await db.staffMember.create({
      data: { businessId: business.id, userId: barberUser.id },
    });
    const customer = await loggedInAgent("customer@example.com");

    const asBarber = await barber.get("/me/workspace");
    const asCustomer = await customer.get("/me/workspace");

    expect(asBarber.body).toEqual({
      business: null,
      staffMemberships: [
        {
          staffId: membership.id,
          business: {
            id: business.id,
            name: "Berlin Barbers",
            slug: business.slug,
            timezone: "Europe/Berlin",
          },
        },
      ],
    });
    expect(asCustomer.body).toEqual({ business: null, staffMemberships: [] });
  });

  it("requires login", async () => {
    const res = await request(app).get("/me/workspace");

    expect(res.status).toBe(401);
  });
});
