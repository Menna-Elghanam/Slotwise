import { Queue } from "bullmq";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { REFUND_QUEUE } from "../../jobs/refunds.js";
import { config } from "../../lib/config.js";
import { db } from "../../lib/db.js";
import { createRedisConnection } from "../../lib/redis.js";
import { stripe } from "../../lib/stripe.js";
import { resetDb } from "../../test/db.js";
import { emailInbox } from "../../test/emails.js";
import { app, bookableBusiness, loggedInAgent, upcomingMonday } from "../../test/helpers.js";
import { localTimeToUtc } from "../slots/slots.calculator.js";

const nineAm = localTimeToUtc(upcomingMonday(), 540, "Europe/Berlin").toISOString();

const connection = createRedisConnection();
const refundQueue = new Queue(REFUND_QUEUE, { connection });
const inbox = emailInbox();

beforeEach(async () => {
  await resetDb();
  await refundQueue.obliterate({ force: true });
  await inbox.clear();
});

afterAll(async () => {
  await refundQueue.close();
  connection.disconnect();
  await inbox.close();
});

/** A PENDING booking whose customer has opened checkout session `cs_1`. */
async function bookingInCheckout() {
  const { service, staff } = await bookableBusiness();
  const customer = await loggedInAgent("customer@example.com");
  const res = await customer
    .post("/bookings")
    .send({ serviceId: service.id, staffId: staff.id, startsAt: nineAm });
  const { booking } = res.body as { booking: { id: string } };
  await db.payment.create({
    data: {
      bookingId: booking.id,
      stripeCheckoutSessionId: "cs_1",
      amountCents: 2500,
      currency: "EUR",
    },
  });
  return booking;
}

/** Sends an event signed the way Stripe signs it (signing is local; no network). */
function sendEvent(id: string, type: string, object: Record<string, unknown>, secret?: string) {
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secret ?? config.STRIPE_WEBHOOK_SECRET,
  });
  return request(app)
    .post("/webhooks/stripe")
    .set("Content-Type", "application/json")
    .set("Stripe-Signature", signature)
    .send(payload);
}

const paidSession = { id: "cs_1", payment_status: "paid", payment_intent: "pi_1" };

async function loadBooking(id: string) {
  return db.booking.findUniqueOrThrow({ where: { id }, include: { payment: true } });
}

describe("POST /webhooks/stripe", () => {
  it("confirms the booking when checkout is paid", async () => {
    const booking = await bookingInCheckout();

    const res = await sendEvent("evt_1", "checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    const saved = await loadBooking(booking.id);
    expect(saved).toMatchObject({ status: "CONFIRMED", expiresAt: null });
    expect(saved.payment).toMatchObject({ status: "PAID", stripePaymentIntentId: "pi_1" });
    const subjects = (await inbox.messagesTo("customer@example.com")).map((m) => m.subject);
    expect(subjects).toContain("Booking confirmed: Haircut at Berlin Barbers");
  });

  it("processes a redelivered event only once", async () => {
    await bookingInCheckout();

    const first = await sendEvent("evt_1", "checkout.session.completed", paidSession);
    const second = await sendEvent("evt_1", "checkout.session.completed", paidSession);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await db.stripeEvent.count()).toBe(1);
  });

  it("rejects a request not signed with our secret", async () => {
    const booking = await bookingInCheckout();

    const res = await sendEvent("evt_1", "checkout.session.completed", paidSession, "whsec_forged");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_SIGNATURE" } });
    expect((await loadBooking(booking.id)).status).toBe("PENDING");
  });

  it("rejects a request without a signature", async () => {
    const res = await request(app)
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send({ id: "evt_1" });

    expect(res.status).toBe(400);
  });

  it("keeps an expired booking expired and queues a refund when the payment is late", async () => {
    const booking = await bookingInCheckout();
    await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });

    const res = await sendEvent("evt_1", "checkout.session.completed", paidSession);

    expect(res.status).toBe(200);
    const saved = await loadBooking(booking.id);
    expect(saved.status).toBe("EXPIRED");
    expect(saved.payment?.status).toBe("PAID");
    expect(await refundQueue.getJob(`refund-${saved.payment?.id}`)).toBeDefined();
  });

  it("marks the payment failed when the session expires", async () => {
    const booking = await bookingInCheckout();

    await sendEvent("evt_1", "checkout.session.expired", { id: "cs_1" });

    expect((await loadBooking(booking.id)).payment?.status).toBe("FAILED");
  });

  it("acknowledges events it doesn't handle", async () => {
    const res = await sendEvent("evt_1", "customer.created", { id: "cus_1" });

    expect(res.status).toBe(200);
  });
});
