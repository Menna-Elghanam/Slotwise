import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/db.js";
import { app, createBusiness, loggedInAgent, soloBusiness } from "../../test/helpers.js";

beforeEach(async () => {
  await resetDb();
});

describe("POST /businesses/:businessId/staff/me", () => {
  it("lets the owner add themselves as staff", async () => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent.post(`/businesses/${business.id}/staff/me`);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ staff: { businessId: business.id, isActive: true } });
  });

  it("rejects adding the same person twice", async () => {
    const { agent, business } = await soloBusiness();

    const res = await agent.post(`/businesses/${business.id}/staff/me`);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "ALREADY_STAFF" } });
  });

  it("forbids users who don't own the business", async () => {
    const { business } = await createBusiness("owner@example.com");
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.post(`/businesses/${business.id}/staff/me`);

    expect(res.status).toBe(403);
  });
});

describe("PUT /staff/:id/services", () => {
  it("assigns services, shown in the public staff list without private data", async () => {
    const { agent, business, service, staff } = await soloBusiness();

    const res = await agent.put(`/staff/${staff.id}/services`).send({ serviceIds: [service.id] });
    const list = await request(app).get(`/businesses/${business.id}/staff`);

    expect(res.status).toBe(200);
    expect(list.body).toEqual({
      staff: [{ id: staff.id, name: "Owner", serviceIds: [service.id] }],
    });
  });

  it("rejects a service from another business", async () => {
    const mine = await soloBusiness("owner@example.com");
    const other = await soloBusiness("other@example.com");

    const res = await mine.agent
      .put(`/staff/${mine.staff.id}/services`)
      .send({ serviceIds: [other.service.id] });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_SERVICES" } });
  });

  it("forbids users who don't own the business", async () => {
    const { service, staff } = await soloBusiness();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger
      .put(`/staff/${staff.id}/services`)
      .send({ serviceIds: [service.id] });

    expect(res.status).toBe(403);
  });
});
