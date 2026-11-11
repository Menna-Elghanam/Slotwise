import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { app, bookableBusiness, loggedInAgent, upcomingMonday } from "../../test/helpers.js";
import { localTimeToUtc } from "../slots/slots.calculator.js";

const date = upcomingMonday();
const nineAm = localTimeToUtc(date, 540, "Europe/Berlin").toISOString();

beforeEach(async () => {
  await resetDb();
});

/** A customer's booking at 09:00 with the owner (who is also the only staff member). */
async function bookedSlot() {
  const { agent: owner, business, service, staff } = await bookableBusiness();
  const customer = await loggedInAgent("customer@example.com");
  const res = await customer
    .post("/bookings")
    .send({ serviceId: service.id, staffId: staff.id, startsAt: nineAm });
  const { booking } = res.body as { booking: { id: string } };
  return { owner, customer, business, service, staff, booking };
}

describe("GET /bookings/me", () => {
  it("lists the customer's upcoming bookings with names", async () => {
    const { customer, booking } = await bookedSlot();

    const res = await customer.get("/bookings/me");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      bookings: [
        {
          id: booking.id,
          status: "PENDING",
          staffName: "Owner",
          business: { name: "Berlin Barbers", timezone: "Europe/Berlin" },
          service: { name: "Haircut" },
        },
      ],
    });
  });

  it("shows nothing of other customers' bookings", async () => {
    await bookedSlot();
    const someoneElse = await loggedInAgent("someone@example.com");

    const res = await someoneElse.get("/bookings/me");

    expect(res.body).toEqual({ bookings: [] });
  });

  it("moves cancelled bookings to 'past'", async () => {
    const { customer, booking } = await bookedSlot();
    await customer.post(`/bookings/${booking.id}/cancel`);

    const upcoming = await customer.get("/bookings/me?scope=upcoming");
    const past = await customer.get("/bookings/me?scope=past");

    expect(upcoming.body).toEqual({ bookings: [] });
    expect(past.body).toMatchObject({ bookings: [{ id: booking.id, status: "CANCELLED" }] });
  });
});

describe("GET /bookings/:id", () => {
  it("shows the booking to its customer and to the business, with the viewer's role", async () => {
    const { owner, customer, booking } = await bookedSlot();

    const byCustomer = await customer.get(`/bookings/${booking.id}`);
    const byOwner = await owner.get(`/bookings/${booking.id}`);

    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body).toMatchObject({
      booking: {
        id: booking.id,
        status: "PENDING",
        staffName: "Owner",
        viewer: "customer",
        business: { name: "Berlin Barbers", timezone: "Europe/Berlin", cancelCutoffHours: 24 },
        service: { name: "Haircut" },
        payment: null,
      },
    });
    expect(byOwner.body).toMatchObject({
      booking: { viewer: "business", customer: { email: "customer@example.com" } },
    });
    expect(JSON.stringify(byOwner.body)).not.toContain("ownerId");
  });

  it("hides other people's bookings behind a 404", async () => {
    const { booking } = await bookedSlot();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.get(`/bookings/${booking.id}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /bookings/:id/cancel", () => {
  it("lets the customer cancel before the cutoff and frees the slot", async () => {
    const { customer, business, service, booking } = await bookedSlot();

    const res = await customer.post(`/bookings/${booking.id}/cancel`);
    const slots = await request(app)
      .get(`/businesses/${business.id}/slots`)
      .query({ serviceId: service.id, date });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      booking: { status: "CANCELLED", cancelledAt: expect.any(String) },
    });
    const starts = (slots.body as { slots: { startsAt: string }[] }).slots.map((s) => s.startsAt);
    expect(starts).toContain(nineAm);
  });

  it("blocks the customer after the cutoff on a paid booking, but not the owner", async () => {
    const { owner, customer, business, booking } = await bookedSlot();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    // A 30-day cutoff puts the upcoming booking well past it.
    await db.business.update({ where: { id: business.id }, data: { cancelCutoffHours: 24 * 30 } });

    const byCustomer = await customer.post(`/bookings/${booking.id}/cancel`);
    const byOwner = await owner.post(`/bookings/${booking.id}/cancel`);

    expect(byCustomer.status).toBe(409);
    expect(byCustomer.body).toMatchObject({ error: { code: "CANCELLATION_CLOSED" } });
    expect(byOwner.status).toBe(200);
  });

  it("lets the customer release an unpaid hold even after the cutoff", async () => {
    const { customer, business, booking } = await bookedSlot();
    await db.business.update({ where: { id: business.id }, data: { cancelCutoffHours: 24 * 30 } });

    const res = await customer.post(`/bookings/${booking.id}/cancel`);

    expect(res.status).toBe(200);
  });

  it("hides other people's bookings behind a 404", async () => {
    const { booking } = await bookedSlot();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.post(`/bookings/${booking.id}/cancel`);

    expect(res.status).toBe(404);
  });

  it("can't cancel the same booking twice", async () => {
    const { customer, booking } = await bookedSlot();
    await customer.post(`/bookings/${booking.id}/cancel`);

    const again = await customer.post(`/bookings/${booking.id}/cancel`);

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: { code: "NOT_CANCELLABLE" } });
  });
});

describe("POST /bookings/:id/reschedule", () => {
  const at = (minute: number) => localTimeToUtc(date, minute, "Europe/Berlin").toISOString();

  it("moves the booking to a time overlapping its old one, and frees the old start", async () => {
    const { customer, business, service, booking } = await bookedSlot();

    // 09:00–09:30 → 09:15–09:45: only works if the booking doesn't block itself.
    const res = await customer
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(555) });
    const slots = await request(app)
      .get(`/businesses/${business.id}/slots`)
      .query({ serviceId: service.id, date });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      booking: { id: booking.id, status: "PENDING", startsAt: at(555), endsAt: at(585) },
    });
    const starts = (slots.body as { slots: { startsAt: string }[] }).slots.map((s) => s.startsAt);
    expect(starts).not.toContain(at(555));
    expect(starts).not.toContain(nineAm);
  });

  it("rejects a time someone else has booked", async () => {
    const { customer, service, staff, booking } = await bookedSlot();
    const other = await loggedInAgent("other@example.com");
    await other
      .post("/bookings")
      .send({ serviceId: service.id, staffId: staff.id, startsAt: at(570) });

    const res = await customer
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(570) });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "SLOT_TAKEN" } });
  });

  it("blocks the customer after the cutoff on a paid booking, but not the owner", async () => {
    const { owner, customer, business, booking } = await bookedSlot();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });
    await db.business.update({ where: { id: business.id }, data: { cancelCutoffHours: 24 * 30 } });

    const byCustomer = await customer
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(570) });
    const byOwner = await owner
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(570) });

    expect(byCustomer.status).toBe(409);
    expect(byCustomer.body).toMatchObject({ error: { code: "RESCHEDULE_CLOSED" } });
    expect(byOwner.status).toBe(200);
  });

  it("hides other people's bookings behind a 404", async () => {
    const { booking } = await bookedSlot();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(570) });

    expect(res.status).toBe(404);
  });

  it("can't reschedule a cancelled booking", async () => {
    const { customer, booking } = await bookedSlot();
    await customer.post(`/bookings/${booking.id}/cancel`);

    const res = await customer
      .post(`/bookings/${booking.id}/reschedule`)
      .send({ startsAt: at(570) });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "NOT_RESCHEDULABLE" } });
  });

  it("rejects a missing start time", async () => {
    const { customer, booking } = await bookedSlot();

    const res = await customer.post(`/bookings/${booking.id}/reschedule`).send({});

    expect(res.status).toBe(400);
  });

  it("lets exactly one of several concurrent reschedules into the same slot win", async () => {
    const { agent: owner, service, staff } = await bookableBusiness();
    await owner
      .put(`/staff/${staff.id}/working-hours`)
      .send({ ranges: [{ dayOfWeek: 1, startMinute: 540, endMinute: 720 }] });

    // Five customers on different times between 09:00 and 12:00, all racing for 11:00.
    const starts = [540, 570, 600, 630, 690];
    const bookings = await Promise.all(
      starts.map(async (minute, i) => {
        const customer = await loggedInAgent(`racer${i}@example.com`);
        const res = await customer
          .post("/bookings")
          .send({ serviceId: service.id, staffId: staff.id, startsAt: at(minute) });
        return { customer, id: (res.body as { booking: { id: string } }).booking.id };
      }),
    );

    const results = await Promise.all(
      bookings.map(({ customer, id }) =>
        customer.post(`/bookings/${id}/reschedule`).send({ startsAt: at(660) }),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409, 409]);
    for (const loser of results.filter((r) => r.status === 409)) {
      expect(loser.body).toMatchObject({ error: { code: "SLOT_TAKEN" } });
    }
    expect(await db.booking.count({ where: { startsAt: new Date(at(660)) } })).toBe(1);
  });
});

describe("POST /bookings/:id/outcome", () => {
  /** Moves the booking to yesterday and marks it paid, as if the appointment happened. */
  async function pastConfirmed(bookingId: string) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.booking.update({
      where: { id: bookingId },
      data: {
        status: "CONFIRMED",
        expiresAt: null,
        startsAt: yesterday,
        endsAt: new Date(yesterday.getTime() + 30 * 60 * 1000),
        blockedUntil: new Date(yesterday.getTime() + 30 * 60 * 1000),
      },
    });
  }

  it("lets the business mark a past booking as completed", async () => {
    const { owner, booking } = await bookedSlot();
    await pastConfirmed(booking.id);

    const res = await owner.post(`/bookings/${booking.id}/outcome`).send({ status: "COMPLETED" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ booking: { status: "COMPLETED" } });
  });

  it("refuses a booking that hasn't started yet", async () => {
    const { owner, booking } = await bookedSlot();

    const res = await owner.post(`/bookings/${booking.id}/outcome`).send({ status: "NO_SHOW" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "OUTCOME_NOT_ALLOWED" } });
  });

  it("is only for the business side, not the customer or strangers", async () => {
    const { customer, booking } = await bookedSlot();
    await pastConfirmed(booking.id);
    const stranger = await loggedInAgent("stranger@example.com");

    const byCustomer = await customer
      .post(`/bookings/${booking.id}/outcome`)
      .send({ status: "COMPLETED" });
    const byStranger = await stranger
      .post(`/bookings/${booking.id}/outcome`)
      .send({ status: "NO_SHOW" });

    expect([byCustomer.status, byStranger.status]).toEqual([404, 404]);
  });

  it("rejects other statuses", async () => {
    const { owner, booking } = await bookedSlot();

    const res = await owner.post(`/bookings/${booking.id}/outcome`).send({ status: "CANCELLED" });

    expect(res.status).toBe(400);
  });
});

describe("GET /staff/:id/bookings", () => {
  it("shows the schedule with customer names to the owner", async () => {
    const { owner, staff, booking } = await bookedSlot();

    const res = await owner.get(`/staff/${staff.id}/bookings`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      bookings: [{ id: booking.id, customerName: "Owner", serviceName: "Haircut" }],
    });
  });

  it("forbids anyone else", async () => {
    const { staff } = await bookedSlot();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.get(`/staff/${staff.id}/bookings`);

    expect(res.status).toBe(403);
  });
});
