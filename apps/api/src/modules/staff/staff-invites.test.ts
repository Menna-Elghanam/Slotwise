import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { emailInbox } from "../../test/emails.js";
import {
  app,
  bookableBusiness,
  createBusiness,
  loggedInAgent,
  upcomingMonday,
} from "../../test/helpers.js";
import { localTimeToUtc } from "../slots/slots.calculator.js";

const inbox = emailInbox();
const invitee = "barber@example.com";

beforeEach(async () => {
  await resetDb();
  await inbox.clear();
});

afterAll(async () => {
  await inbox.close();
});

describe("staff invites", () => {
  it("lets the invited person join by opening the emailed link", async () => {
    const { agent: owner, business } = await createBusiness("owner@example.com");

    const invited = await owner
      .post(`/businesses/${business.id}/staff/invites`)
      .send({ email: invitee });
    const pending = await owner.get(`/businesses/${business.id}/staff/invites`);
    const token = await inbox.tokenSentTo(invitee);
    const barber = await loggedInAgent(invitee);
    const accepted = await barber.post("/staff/invites/accept").send({ token });
    const pendingAfter = await owner.get(`/businesses/${business.id}/staff/invites`);
    const publicList = await request(app).get(`/businesses/${business.id}/staff`);

    expect(invited.status).toBe(201);
    expect(pending.body).toMatchObject({ invites: [{ email: invitee }] });
    expect(accepted.status).toBe(201);
    expect(accepted.body).toMatchObject({ staff: { businessId: business.id, isActive: true } });
    expect(pendingAfter.body).toEqual({ invites: [] });
    expect(publicList.body).toMatchObject({ staff: [{ name: "Owner" }] });
  });

  it("refuses someone logged in with a different email", async () => {
    const { agent: owner, business } = await createBusiness("owner@example.com");
    await owner.post(`/businesses/${business.id}/staff/invites`).send({ email: invitee });
    const token = await inbox.tokenSentTo(invitee);
    const someoneElse = await loggedInAgent("someone@example.com");

    const res = await someoneElse.post("/staff/invites/accept").send({ token });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "INVITE_EMAIL_MISMATCH" } });
  });

  it("can't be used twice", async () => {
    const { agent: owner, business } = await createBusiness("owner@example.com");
    await owner.post(`/businesses/${business.id}/staff/invites`).send({ email: invitee });
    const token = await inbox.tokenSentTo(invitee);
    const barber = await loggedInAgent(invitee);
    await barber.post("/staff/invites/accept").send({ token });

    const again = await barber.post("/staff/invites/accept").send({ token });

    expect(again.status).toBe(400);
  });

  it("rejects inviting someone who is already staff", async () => {
    const { agent: owner, business } = await createBusiness("owner@example.com");
    await owner.post(`/businesses/${business.id}/staff/me`);

    const res = await owner
      .post(`/businesses/${business.id}/staff/invites`)
      .send({ email: "owner@example.com" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "ALREADY_STAFF" } });
  });

  it("only lets the owner invite or see invites", async () => {
    const { business } = await createBusiness("owner@example.com");
    const stranger = await loggedInAgent("stranger@example.com");

    const invite = await stranger
      .post(`/businesses/${business.id}/staff/invites`)
      .send({ email: invitee });
    const list = await stranger.get(`/businesses/${business.id}/staff/invites`);

    expect([invite.status, list.status]).toEqual([403, 403]);
    expect(await inbox.messagesTo(invitee)).toEqual([]);
  });
});

describe("PATCH /staff/:id", () => {
  it("deactivates a staff member without bookings, hiding them from customers", async () => {
    const { agent: owner, business, staff } = await bookableBusiness();

    const res = await owner.patch(`/staff/${staff.id}`).send({ isActive: false });
    const publicList = await request(app).get(`/businesses/${business.id}/staff`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ staff: { isActive: false } });
    expect(publicList.body).toEqual({ staff: [] });
  });

  it("refuses while the staff member has upcoming bookings", async () => {
    const { agent: owner, service, staff } = await bookableBusiness();
    const customer = await loggedInAgent("customer@example.com");
    const startsAt = localTimeToUtc(upcomingMonday(), 540, "Europe/Berlin").toISOString();
    await customer.post("/bookings").send({ serviceId: service.id, staffId: staff.id, startsAt });

    const res = await owner.patch(`/staff/${staff.id}`).send({ isActive: false });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: { code: "HAS_UPCOMING_BOOKINGS", details: { upcomingBookings: 1 } },
    });
    expect((await db.staffMember.findUniqueOrThrow({ where: { id: staff.id } })).isActive).toBe(
      true,
    );
  });

  it("forbids anyone but the owner", async () => {
    const { staff } = await bookableBusiness();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.patch(`/staff/${staff.id}`).send({ isActive: false });

    expect(res.status).toBe(403);
  });
});
