import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { app, loggedInAgent, soloBusiness } from "../../test/helpers.js";

// Monday with a lunch break: 09:00–13:00 and 14:00–18:00.
const mondayWithLunch = [
  { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
  { dayOfWeek: 1, startMinute: 840, endMinute: 1080 },
];

const christmas = {
  startsAt: "2027-12-24T00:00:00+01:00",
  endsAt: "2027-12-27T00:00:00+01:00",
  reason: "Holiday",
};

beforeEach(async () => {
  await resetDb();
});

/** A second user who is staff at the business but not its owner. */
async function employeeOf(businessId: string) {
  const agent = await loggedInAgent("employee@example.com");
  const me = await agent.get("/auth/me");
  const { user } = me.body as { user: { id: string } };
  const staff = await db.staffMember.create({ data: { businessId, userId: user.id } });
  return { agent, staff };
}

describe("PUT /staff/:id/working-hours", () => {
  it("replaces the weekly schedule, readable publicly in order", async () => {
    const { agent, staff } = await soloBusiness();

    const res = await agent
      .put(`/staff/${staff.id}/working-hours`)
      .send({ ranges: [...mondayWithLunch].reverse() });
    const publicView = await request(app).get(`/staff/${staff.id}/working-hours`);

    expect(res.status).toBe(200);
    expect(publicView.body).toEqual({ ranges: mondayWithLunch });
  });

  it("rejects overlapping ranges on the same day", async () => {
    const { agent, staff } = await soloBusiness();

    const res = await agent.put(`/staff/${staff.id}/working-hours`).send({
      ranges: [
        { dayOfWeek: 1, startMinute: 540, endMinute: 780 },
        { dayOfWeek: 1, startMinute: 720, endMinute: 900 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: { details: { ranges: ["Ranges overlap on the same day"] } },
    });
  });

  it("rejects a range that ends before it starts", async () => {
    const { agent, staff } = await soloBusiness();

    const res = await agent
      .put(`/staff/${staff.id}/working-hours`)
      .send({ ranges: [{ dayOfWeek: 1, startMinute: 600, endMinute: 540 }] });

    expect(res.status).toBe(400);
  });

  it("lets the staff member manage their own hours", async () => {
    const { business } = await soloBusiness();
    const employee = await employeeOf(business.id);

    const res = await employee.agent
      .put(`/staff/${employee.staff.id}/working-hours`)
      .send({ ranges: mondayWithLunch });

    expect(res.status).toBe(200);
  });

  it("forbids anyone else", async () => {
    const { staff } = await soloBusiness();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger
      .put(`/staff/${staff.id}/working-hours`)
      .send({ ranges: mondayWithLunch });

    expect(res.status).toBe(403);
  });
});

describe("time off", () => {
  it("adds, lists and deletes time off, stored in UTC", async () => {
    const { agent, staff } = await soloBusiness();

    const created = await agent.post(`/staff/${staff.id}/time-off`).send(christmas);
    const { timeOff } = created.body as { timeOff: { id: string } };
    const list = await agent.get(`/staff/${staff.id}/time-off`);
    const deleted = await agent.delete(`/time-off/${timeOff.id}`);
    const listAfter = await agent.get(`/staff/${staff.id}/time-off`);

    expect(created.status).toBe(201);
    // Midnight in Berlin (UTC+1 in winter) is 23:00 UTC the day before.
    expect(created.body).toMatchObject({ timeOff: { startsAt: "2027-12-23T23:00:00.000Z" } });
    expect(list.body).toMatchObject({ timeOff: [{ id: timeOff.id, reason: "Holiday" }] });
    expect(deleted.status).toBe(204);
    expect(listAfter.body).toEqual({ timeOff: [] });
  });

  it("rejects time off that ends before it starts", async () => {
    const { agent, staff } = await soloBusiness();

    const res = await agent
      .post(`/staff/${staff.id}/time-off`)
      .send({ startsAt: christmas.endsAt, endsAt: christmas.startsAt });

    expect(res.status).toBe(400);
  });

  it("keeps time off private from other users", async () => {
    const { agent, staff } = await soloBusiness();
    const created = await agent.post(`/staff/${staff.id}/time-off`).send(christmas);
    const { timeOff } = created.body as { timeOff: { id: string } };
    const stranger = await loggedInAgent("stranger@example.com");

    const list = await stranger.get(`/staff/${staff.id}/time-off`);
    const deleted = await stranger.delete(`/time-off/${timeOff.id}`);

    expect(list.status).toBe(403);
    expect(deleted.status).toBe(403);
  });
});
