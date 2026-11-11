import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/db.js";
import { app, createBusiness, loggedInAgent } from "../../test/helpers.js";

const haircut = { name: "Haircut", durationMinutes: 30, bufferMinutes: 10, priceCents: 2500 };

beforeEach(async () => {
  await resetDb();
});

async function businessWithService() {
  const { agent, business } = await createBusiness("owner@example.com");
  const res = await agent.post(`/businesses/${business.id}/services`).send(haircut);
  const { service } = res.body as { service: { id: string } };
  return { agent, business, service };
}

describe("POST /businesses/:businessId/services", () => {
  it("lets the owner add a service", async () => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent.post(`/businesses/${business.id}/services`).send(haircut);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ service: { ...haircut, currency: "EUR", isActive: true } });
  });

  it("forbids other users", async () => {
    const { business } = await createBusiness("owner@example.com");
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.post(`/businesses/${business.id}/services`).send(haircut);

    expect(res.status).toBe(403);
  });

  it("rejects a price below Stripe's minimum", async () => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent
      .post(`/businesses/${business.id}/services`)
      .send({ ...haircut, priceCents: 49 });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { details: { priceCents: expect.any(Array) } } });
  });
});

describe("GET /businesses/:businessId/services", () => {
  it("lists active services publicly, without internal fields", async () => {
    const { business } = await businessWithService();

    const res = await request(app).get(`/businesses/${business.id}/services`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ services: [{ name: "Haircut", priceCents: 2500 }] });
    expect(res.body).not.toHaveProperty("services.0.bufferMinutes");
  });
});

describe("PATCH /services/:id", () => {
  it("lets the owner change the price", async () => {
    const { agent, service } = await businessWithService();

    const res = await agent.patch(`/services/${service.id}`).send({ priceCents: 3000 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ service: { priceCents: 3000 } });
  });

  it("returns 404 for an unknown service", async () => {
    const agent = await loggedInAgent("owner@example.com");

    const res = await agent
      .patch("/services/00000000-0000-4000-8000-000000000000")
      .send({ priceCents: 3000 });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /services/:id", () => {
  it("archives the service so it disappears from the public list", async () => {
    const { agent, business, service } = await businessWithService();

    const res = await agent.delete(`/services/${service.id}`);
    const list = await request(app).get(`/businesses/${business.id}/services`);

    expect(res.status).toBe(204);
    expect(list.body).toEqual({ services: [] });
  });

  it("forbids other users", async () => {
    const { service } = await businessWithService();
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.delete(`/services/${service.id}`);

    expect(res.status).toBe(403);
  });
});
