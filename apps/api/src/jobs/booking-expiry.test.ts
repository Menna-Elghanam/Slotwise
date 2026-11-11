import { Queue } from "bullmq";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../lib/db.js";
import { createRedisConnection } from "../lib/redis.js";
import { createBooking } from "../modules/bookings/bookings.service.js";
import { localTimeToUtc } from "../modules/slots/slots.calculator.js";
import { resetDb } from "../test/db.js";
import { app, bookableBusiness, upcomingMonday } from "../test/helpers.js";
import { expireBooking, QUEUE_NAME } from "./booking-expiry.js";

const date = upcomingMonday();
const nineAm = localTimeToUtc(date, 540, "Europe/Berlin");
const elevenMinutesAgo = () => new Date(Date.now() - 11 * 60 * 1000);

const connection = createRedisConnection();
const queue = new Queue(QUEUE_NAME, { connection });

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  // BullMQ doesn't close a client it was given, so close both.
  await queue.close();
  connection.disconnect();
});

/** A booking at 09:00 for the business owner, optionally made "in the past". */
async function pendingBooking(now = new Date()) {
  const { business, service, staff } = await bookableBusiness();
  const customer = await db.user.findFirstOrThrow();
  const booking = await createBooking(
    customer.id,
    { serviceId: service.id, staffId: staff.id, startsAt: nineAm },
    now,
  );
  return { business, service, staff, customer, booking };
}

async function slotStarts(businessId: string, serviceId: string) {
  const res = await request(app).get(`/businesses/${businessId}/slots`).query({ serviceId, date });
  return (res.body as { slots: { startsAt: string }[] }).slots.map((s) => s.startsAt);
}

describe("booking expiry", () => {
  it("schedules a delayed job when a booking is created", async () => {
    const { booking } = await pendingBooking();

    const job = await queue.getJob(booking.id);

    expect(job?.data).toEqual({ bookingId: booking.id });
    // ~10 minutes, allowing a little time for the test itself.
    expect(job?.opts.delay).toBeGreaterThan(9 * 60 * 1000);
  });

  it("expires an unpaid booking after its window and frees the slot", async () => {
    const { business, service, booking } = await pendingBooking(elevenMinutesAgo());

    const expired = await expireBooking(booking.id);

    expect(expired).toBe(true);
    expect(await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({
      status: "EXPIRED",
    });
    expect(await slotStarts(business.id, service.id)).toContain(nineAm.toISOString());
  });

  it("leaves a booking alone while its payment window is still open", async () => {
    const { booking } = await pendingBooking();

    expect(await expireBooking(booking.id)).toBe(false);
  });

  it("never expires a paid booking", async () => {
    const { booking } = await pendingBooking(elevenMinutesAgo());
    await db.booking.update({ where: { id: booking.id }, data: { status: "CONFIRMED" } });

    expect(await expireBooking(booking.id)).toBe(false);
  });

  it("safety net: a stale unpaid booking doesn't block a new one even if no job ran", async () => {
    const { service, staff, customer, booking } = await pendingBooking(elevenMinutesAgo());

    const second = await createBooking(customer.id, {
      serviceId: service.id,
      staffId: staff.id,
      startsAt: nineAm,
    });

    expect(second.status).toBe("PENDING");
    expect(await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({
      status: "EXPIRED",
    });
  });
});
