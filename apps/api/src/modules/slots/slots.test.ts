import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import {
  app,
  bookableBusiness,
  loggedInAgent,
  mondayNineToTen,
  upcomingMonday,
} from "../../test/helpers.js";
import { localTimeToUtc } from "./slots.calculator.js";

const TZ = "Europe/Berlin";
const date = upcomingMonday();
const at = (minuteOfDay: number) => localTimeToUtc(date, minuteOfDay, TZ);

beforeEach(async () => {
  await resetDb();
});

function getSlots(businessId: string, query: Record<string, string>) {
  return request(app).get(`/businesses/${businessId}/slots`).query(query);
}

describe("GET /businesses/:businessId/slots", () => {
  it("lists free start times with the staff who are free", async () => {
    const { business, service, staff } = await bookableBusiness();

    const res = await getSlots(business.id, { serviceId: service.id, date });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      date,
      timezone: TZ,
      slots: [540, 555, 570].map((m) => ({
        startsAt: at(m).toISOString(),
        staffIds: [staff.id],
      })),
    });
  });

  it("removes slots blocked by an existing booking", async () => {
    const { business, service, staff } = await bookableBusiness();
    const owner = await db.user.findFirstOrThrow();
    await db.booking.create({
      data: {
        customerId: owner.id,
        businessId: business.id,
        serviceId: service.id,
        staffId: staff.id,
        startsAt: at(540),
        endsAt: at(570),
        blockedUntil: at(570),
        durationMinutes: 30,
        bufferMinutes: 0,
        priceCents: 2500,
        currency: "EUR",
        status: "CONFIRMED",
      },
    });

    const res = await getSlots(business.id, { serviceId: service.id, date });

    expect(res.body).toMatchObject({ slots: [{ startsAt: at(570).toISOString() }] });
    expect((res.body as { slots: unknown[] }).slots).toHaveLength(1);
  });

  it("merges staff for 'any available staff'", async () => {
    const { business, service, staff } = await bookableBusiness();
    const employeeAgent = await loggedInAgent("employee@example.com");
    const { user } = (await employeeAgent.get("/auth/me")).body as { user: { id: string } };
    const employee = await db.staffMember.create({
      data: {
        businessId: business.id,
        userId: user.id,
        services: { create: { serviceId: service.id } },
        workingHours: { create: mondayNineToTen },
      },
    });

    const res = await getSlots(business.id, { serviceId: service.id, date });

    expect(res.body).toMatchObject({
      slots: [540, 555, 570].map((m) => ({
        startsAt: at(m).toISOString(),
        staffIds: [staff.id, employee.id],
      })),
    });
  });

  it("returns 404 when the chosen staff member doesn't offer the service", async () => {
    const { agent, business, staff } = await bookableBusiness();
    const otherService = await agent
      .post(`/businesses/${business.id}/services`)
      .send({ name: "Beard trim", durationMinutes: 15, priceCents: 1000 });
    const { service } = otherService.body as { service: { id: string } };

    const res = await getSlots(business.id, { serviceId: service.id, staffId: staff.id, date });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "STAFF_NOT_FOUND" } });
  });

  it("rejects an invalid date", async () => {
    const { business, service } = await bookableBusiness();

    const res = await getSlots(business.id, { serviceId: service.id, date: "2027-02-30" });

    expect(res.status).toBe(400);
  });
});
