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
import { localTimeToUtc } from "../slots/slots.calculator.js";

const date = upcomingMonday();
const nineAm = localTimeToUtc(date, 540, "Europe/Berlin").toISOString();

beforeEach(async () => {
  await resetDb();
});

/** Registers `count` customers one by one (registration is slow on purpose: bcrypt). */
async function customers(count: number) {
  const agents = [];
  for (let i = 0; i < count; i++) {
    agents.push(await loggedInAgent(`customer${i}@example.com`));
  }
  return agents;
}

describe("POST /bookings", () => {
  it("creates a PENDING booking with copied price and duration", async () => {
    const { service, staff } = await bookableBusiness();
    const [customer] = await customers(1);

    const res = await customer!
      .post("/bookings")
      .send({ serviceId: service.id, staffId: staff.id, startsAt: nineAm });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      booking: {
        staffId: staff.id,
        startsAt: nineAm,
        status: "PENDING",
        priceCents: 2500,
        durationMinutes: 30,
        expiresAt: expect.any(String),
      },
    });
  });

  it("requires login", async () => {
    const { service } = await bookableBusiness();

    const res = await request(app)
      .post("/bookings")
      .send({ serviceId: service.id, startsAt: nineAm });

    expect(res.status).toBe(401);
  });

  it("rejects a time that isn't an available slot", async () => {
    const { service } = await bookableBusiness();
    const [customer] = await customers(1);
    const offGrid = localTimeToUtc(date, 545, "Europe/Berlin").toISOString(); // 09:05

    const res = await customer!
      .post("/bookings")
      .send({ serviceId: service.id, startsAt: offGrid });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "SLOT_TAKEN" } });
  });

  it("assigns another free staff member for 'any staff', then runs out", async () => {
    const { business, service } = await bookableBusiness();
    const employeeAgent = await loggedInAgent("employee@example.com");
    const { user } = (await employeeAgent.get("/auth/me")).body as { user: { id: string } };
    await db.staffMember.create({
      data: {
        businessId: business.id,
        userId: user.id,
        services: { create: { serviceId: service.id } },
        workingHours: { create: mondayNineToTen },
      },
    });
    const [first, second, third] = await customers(3);
    const body = { serviceId: service.id, startsAt: nineAm };

    const a = await first!.post("/bookings").send(body);
    const b = await second!.post("/bookings").send(body);
    const c = await third!.post("/bookings").send(body);

    expect([a.status, b.status, c.status]).toEqual([201, 201, 409]);
    const staffA = (a.body as { booking: { staffId: string } }).booking.staffId;
    const staffB = (b.body as { booking: { staffId: string } }).booking.staffId;
    expect(staffA).not.toBe(staffB);
  });

  it("lets exactly one of many simultaneous requests win the same slot", async () => {
    const { service, staff } = await bookableBusiness();
    const agents = await customers(10);
    const body = { serviceId: service.id, staffId: staff.id, startsAt: nineAm };

    // Fire all requests at once: they all pass the "is it free?" check before any insert lands.
    const results = await Promise.all(agents.map((agent) => agent.post("/bookings").send(body)));

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
    expect(await db.booking.count()).toBe(1);
  });
});
