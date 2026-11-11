import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { processEmailJob } from "../../jobs/email-worker.js";
import { reminderJobId } from "../../jobs/emails.js";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { emailInbox } from "../../test/emails.js";
import { bookableBusiness, loggedInAgent, upcomingMonday } from "../../test/helpers.js";
import { localTimeToUtc } from "../slots/slots.calculator.js";
import { buildReminder, notifyBookingConfirmed } from "./notifications.service.js";

const mailer = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../../lib/mailer.js", () => mailer);

const date = upcomingMonday();
const at = (minute: number) => localTimeToUtc(date, minute, "Europe/Berlin");
const customerEmail = "customer@example.com";
const inbox = emailInbox();

beforeEach(async () => {
  await resetDb();
  await inbox.clear();
  vi.resetAllMocks();
});

afterAll(async () => {
  await inbox.close();
});

/** A paid booking at 09:00, the way the Stripe webhook leaves it. */
async function confirmedBooking() {
  const { agent: owner, service, staff } = await bookableBusiness();
  const customer = await loggedInAgent(customerEmail);
  const res = await customer
    .post("/bookings")
    .send({ serviceId: service.id, staffId: staff.id, startsAt: at(540).toISOString() });
  const { booking } = res.body as { booking: { id: string } };
  await db.booking.update({
    where: { id: booking.id },
    data: { status: "CONFIRMED", expiresAt: null },
  });
  return { owner, customer, booking };
}

async function subjectsSentToCustomer() {
  return (await inbox.messagesTo(customerEmail)).map((m) => m.subject);
}

describe("booking emails", () => {
  it("sends a confirmation and schedules a reminder a day before", async () => {
    const { booking } = await confirmedBooking();

    await notifyBookingConfirmed(booking.id);

    expect(await subjectsSentToCustomer()).toContain(
      "Booking confirmed: Haircut at Berlin Barbers",
    );
    const reminder = await inbox.queue.getJob(reminderJobId(booking.id, at(540)));
    expect(reminder?.data).toEqual({
      kind: "reminder",
      bookingId: booking.id,
      startsAt: at(540).toISOString(),
    });
  });

  it("emails the customer when a booking is cancelled", async () => {
    const { owner, booking } = await confirmedBooking();

    await owner.post(`/bookings/${booking.id}/cancel`);

    expect(await subjectsSentToCustomer()).toContain(
      "Booking cancelled: Haircut at Berlin Barbers",
    );
  });

  it("emails the new time and schedules a new reminder when a paid booking moves", async () => {
    const { customer, booking } = await confirmedBooking();

    await customer.post(`/bookings/${booking.id}/reschedule`).send({ startsAt: at(570) });

    expect(await subjectsSentToCustomer()).toContain("Booking moved: Haircut at Berlin Barbers");
    expect(await inbox.queue.getJob(reminderJobId(booking.id, at(570)))).toBeDefined();
  });
});

describe("reminders", () => {
  it("are built for a confirmed booking at the expected time", async () => {
    const { booking } = await confirmedBooking();

    const message = await buildReminder(booking.id, at(540).toISOString());

    expect(message).toMatchObject({
      to: customerEmail,
      subject: expect.stringContaining("Reminder"),
    });
    expect(message?.text).toContain("09:00 (Europe/Berlin)");
  });

  it("are skipped when the booking moved or was cancelled", async () => {
    const { booking } = await confirmedBooking();
    const moved = await buildReminder(booking.id, at(600).toISOString());
    await db.booking.update({ where: { id: booking.id }, data: { status: "CANCELLED" } });
    const cancelled = await buildReminder(booking.id, at(540).toISOString());

    expect([moved, cancelled]).toEqual([null, null]);
  });

  it("the worker sends a reminder that still applies and drops one that doesn't", async () => {
    const { booking } = await confirmedBooking();

    const sent = await processEmailJob({
      kind: "reminder",
      bookingId: booking.id,
      startsAt: at(540).toISOString(),
    });
    const skipped = await processEmailJob({
      kind: "reminder",
      bookingId: booking.id,
      startsAt: at(600).toISOString(),
    });

    expect([sent, skipped]).toEqual([true, false]);
    expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
  });
});
