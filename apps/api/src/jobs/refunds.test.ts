import { Queue } from "bullmq";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../lib/db.js";
import { createRedisConnection } from "../lib/redis.js";
import { localTimeToUtc } from "../modules/slots/slots.calculator.js";
import { resetDb } from "../test/db.js";
import { bookableBusiness, loggedInAgent, upcomingMonday } from "../test/helpers.js";
import { queueDueRefunds, REFUND_QUEUE, refundPayment } from "./refunds.js";

const refunds = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../lib/stripe.js", () => ({ stripe: { refunds } }));

const nineAm = localTimeToUtc(upcomingMonday(), 540, "Europe/Berlin").toISOString();
const connection = createRedisConnection();
const queue = new Queue(REFUND_QUEUE, { connection });

beforeEach(async () => {
  await resetDb();
  await queue.obliterate({ force: true });
  vi.resetAllMocks();
  refunds.create.mockResolvedValue({ id: "re_1", status: "succeeded" });
});

afterAll(async () => {
  await queue.close();
  connection.disconnect();
});

/** A booking paid through Stripe, as the webhook leaves it. */
async function paidBooking() {
  const { service, staff } = await bookableBusiness();
  const customer = await loggedInAgent("customer@example.com");
  const res = await customer
    .post("/bookings")
    .send({ serviceId: service.id, staffId: staff.id, startsAt: nineAm });
  const { booking } = res.body as { booking: { id: string } };
  await db.booking.update({
    where: { id: booking.id },
    data: { status: "CONFIRMED", expiresAt: null },
  });
  const payment = await db.payment.create({
    data: {
      bookingId: booking.id,
      stripeCheckoutSessionId: "cs_1",
      stripePaymentIntentId: "pi_1",
      amountCents: 2500,
      currency: "EUR",
      status: "PAID",
    },
  });
  return { customer, booking, payment };
}

describe("refunds", () => {
  it("queues a refund when a paid booking is cancelled", async () => {
    const { customer, booking, payment } = await paidBooking();

    const res = await customer.post(`/bookings/${booking.id}/cancel`);

    expect(res.status).toBe(200);
    expect(await queue.getJob(`refund-${payment.id}`)).toBeDefined();
  });

  it("refunds a cancelled booking once, with an idempotency key", async () => {
    const { booking, payment } = await paidBooking();
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });

    const first = await refundPayment(payment.id);
    const second = await refundPayment(payment.id);

    expect([first, second]).toEqual([true, false]);
    expect(refunds.create).toHaveBeenCalledTimes(1);
    expect(refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_1" },
      { idempotencyKey: `refund-${payment.id}` },
    );
    const saved = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved).toMatchObject({ status: "REFUNDED", refundedAt: expect.any(Date) });
  });

  it("never refunds a booking that still happens", async () => {
    const { payment } = await paidBooking();

    expect(await refundPayment(payment.id)).toBe(false);
    expect(refunds.create).not.toHaveBeenCalled();
  });

  it("keeps the payment PAID when Stripe fails, so the job retries", async () => {
    const { booking, payment } = await paidBooking();
    await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
    refunds.create.mockRejectedValue(new Error("Stripe is down"));

    await expect(refundPayment(payment.id)).rejects.toThrow("Stripe is down");
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID");
  });

  it("the sweep queues refunds that were never queued", async () => {
    const { booking, payment } = await paidBooking();
    // Cancelled directly in the database, so nothing was queued.
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });

    expect(await queueDueRefunds()).toBe(1);
    expect(await queue.getJob(`refund-${payment.id}`)).toBeDefined();
  });
});
