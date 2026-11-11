import { Queue } from "bullmq";
import type Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QUEUE_NAME } from "../../jobs/booking-expiry.js";
import { db } from "../../lib/db.js";
import { createRedisConnection } from "../../lib/redis.js";
import { resetDb } from "../../test/db.js";
import { bookableBusiness, loggedInAgent, upcomingMonday } from "../../test/helpers.js";
import { localTimeToUtc } from "../slots/slots.calculator.js";

// Tests never talk to Stripe: every call goes to these fakes. `vi.hoisted` creates them
// before `vi.mock` runs (Vitest moves `vi.mock` to the top of the file).
const sessions = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() }));
vi.mock("../../lib/stripe.js", () => ({ stripe: { checkout: { sessions } } }));

const nineAm = localTimeToUtc(upcomingMonday(), 540, "Europe/Berlin").toISOString();
const connection = createRedisConnection();
const queue = new Queue(QUEUE_NAME, { connection });

/** Only the fields our code reads; the real type has dozens more. */
function fakeSession(id: string, fields: { status?: "open" | "expired"; expiresAt?: Date } = {}) {
  const expiresAt = fields.expiresAt ?? new Date(Date.now() + 31 * 60 * 1000);
  return {
    id,
    url: `https://checkout.stripe.test/${id}`,
    status: fields.status ?? "open",
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  } as unknown as Stripe.Response<Stripe.Checkout.Session>;
}

beforeEach(async () => {
  await resetDb();
  vi.resetAllMocks();
  sessions.create.mockResolvedValue(fakeSession("cs_1"));
  sessions.retrieve.mockResolvedValue(fakeSession("cs_1"));
  sessions.expire.mockResolvedValue(fakeSession("cs_1", { status: "expired" }));
});

afterAll(async () => {
  await queue.close();
  connection.disconnect();
});

/** A customer's PENDING booking at 09:00. */
async function pendingBooking() {
  const { service, staff } = await bookableBusiness();
  const customer = await loggedInAgent("customer@example.com");
  const res = await customer
    .post("/bookings")
    .send({ serviceId: service.id, staffId: staff.id, startsAt: nineAm });
  const { booking } = res.body as { booking: { id: string } };
  return { customer, booking };
}

describe("POST /bookings/:id/checkout", () => {
  it("creates a session, saves the payment and extends the hold", async () => {
    const { customer, booking } = await pendingBooking();

    const res = await customer.post(`/bookings/${booking.id}/checkout`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ checkoutUrl: "https://checkout.stripe.test/cs_1" });
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: booking.id,
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ currency: "eur", unit_amount: 2500 }),
          }),
        ],
      }),
    );

    const saved = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payment: true },
    });
    expect(saved.payment).toMatchObject({ stripeCheckoutSessionId: "cs_1", status: "PENDING" });
    // Extended from 10 minutes to the session's ~31.
    expect(saved.expiresAt?.getTime()).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
    expect(await queue.getJob(`${booking.id}-checkout`)).toBeDefined();
  });

  it("reuses the open session on a second call", async () => {
    const { customer, booking } = await pendingBooking();
    await customer.post(`/bookings/${booking.id}/checkout`);

    const again = await customer.post(`/bookings/${booking.id}/checkout`);

    expect(again.body).toEqual({ checkoutUrl: "https://checkout.stripe.test/cs_1" });
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.retrieve).toHaveBeenCalledWith("cs_1");
  });

  it("sends the loser of a double click to the winner's session", async () => {
    const { customer, booking } = await pendingBooking();
    // While Stripe is "answering", the other click saves its payment first.
    sessions.create.mockImplementation(async () => {
      await db.payment.create({
        data: {
          bookingId: booking.id,
          stripeCheckoutSessionId: "cs_winner",
          amountCents: 2500,
          currency: "EUR",
        },
      });
      return fakeSession("cs_loser");
    });
    sessions.retrieve.mockResolvedValue(fakeSession("cs_winner"));

    const res = await customer.post(`/bookings/${booking.id}/checkout`);

    expect(res.body).toEqual({ checkoutUrl: "https://checkout.stripe.test/cs_winner" });
    expect(sessions.expire).toHaveBeenCalledWith("cs_loser");
  });

  it("rejects a booking that expired while Stripe was answering, and closes the session", async () => {
    const { customer, booking } = await pendingBooking();
    sessions.create.mockImplementation(async () => {
      await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
      return fakeSession("cs_late");
    });

    const res = await customer.post(`/bookings/${booking.id}/checkout`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "NOT_PAYABLE" } });
    expect(sessions.expire).toHaveBeenCalledWith("cs_late");
    expect(await db.payment.count()).toBe(0);
  });

  it("rejects a booking that is no longer pending without calling Stripe", async () => {
    const { customer, booking } = await pendingBooking();
    await customer.post(`/bookings/${booking.id}/cancel`);

    const res = await customer.post(`/bookings/${booking.id}/checkout`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "NOT_PAYABLE" } });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("hides other people's bookings behind a 404", async () => {
    const { booking } = await pendingBooking();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.post(`/bookings/${booking.id}/checkout`);

    expect(res.status).toBe(404);
  });
});
