import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import {
  app,
  berlinBarbers,
  bookableBusiness,
  createBusiness,
  loggedInAgent,
} from "../../test/helpers.js";
import { slugify } from "./businesses.service.js";

beforeEach(async () => {
  await resetDb();
});

describe("slugify", () => {
  it.each([
    ["Berlin Barbers", "berlin-barbers"],
    ["Café Zürich!", "cafe-zurich"],
    ["  --Dr. Smith & Co--  ", "dr-smith-co"],
    ["!!!", "business"],
  ])("%s → %s", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });
});

describe("POST /businesses", () => {
  it("creates a business with a slug", async () => {
    const agent = await loggedInAgent("owner@example.com");

    const res = await agent.post("/businesses").send(berlinBarbers);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      business: { name: "Berlin Barbers", slug: "berlin-barbers", status: "ACTIVE" },
    });
  });

  it("requires login", async () => {
    const res = await request(app).post("/businesses").send(berlinBarbers);

    expect(res.status).toBe(401);
  });

  it("allows only one business per owner", async () => {
    const { agent } = await createBusiness("owner@example.com");

    const res = await agent.post("/businesses").send({ ...berlinBarbers, name: "Second Shop" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "BUSINESS_EXISTS" } });
  });

  it("adds a suffix when the slug is taken", async () => {
    await createBusiness("first@example.com");
    const { business } = await createBusiness("second@example.com");

    expect(business.slug).toBe("berlin-barbers-2");
  });

  it("rejects an unknown timezone", async () => {
    const agent = await loggedInAgent("owner@example.com");

    const res = await agent
      .post("/businesses")
      .send({ ...berlinBarbers, timezone: "Europe/Berlinn" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { details: { timezone: ["Unknown timezone"] } } });
  });
});

describe("GET /businesses", () => {
  it("filters by category and searches by name, ignoring case", async () => {
    await bookableBusiness("a@example.com");
    await bookableBusiness("b@example.com", {
      ...berlinBarbers,
      name: "City Gym",
      category: "GYM",
    });

    const byCategory = await request(app).get("/businesses?category=GYM");
    const bySearch = await request(app).get("/businesses?search=BARB");

    expect(byCategory.body).toMatchObject({ total: 1, items: [{ name: "City Gym" }] });
    expect(bySearch.body).toMatchObject({ total: 1, items: [{ name: "Berlin Barbers" }] });
  });

  it("lists only businesses customers can book, but keeps the others reachable by link", async () => {
    await bookableBusiness("ready@example.com");
    const { business: unready } = await createBusiness("unready@example.com", {
      ...berlinBarbers,
      name: "Not Ready Yet",
    });

    const list = await request(app).get("/businesses");
    const page = await request(app).get(`/businesses/${unready.slug}`);

    expect(list.body).toMatchObject({ total: 1, items: [{ name: "Berlin Barbers" }] });
    expect(page.status).toBe(200);
  });

  it("hides suspended businesses from the list and the business page", async () => {
    const { business } = await bookableBusiness("owner@example.com");
    await db.business.update({ where: { id: business.id }, data: { status: "SUSPENDED" } });

    const list = await request(app).get("/businesses");
    const page = await request(app).get(`/businesses/${business.slug}`);

    expect(list.body).toMatchObject({ total: 0, items: [] });
    expect(page.status).toBe(404);
  });
});

describe("GET /businesses/:slug", () => {
  it("returns the public view without the owner id", async () => {
    await createBusiness("owner@example.com");

    const res = await request(app).get("/businesses/berlin-barbers");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ business: { slug: "berlin-barbers" } });
    expect(res.body).not.toHaveProperty("business.ownerId");
  });
});

describe("PATCH /businesses/:id", () => {
  it("lets the owner update, keeping the slug", async () => {
    const { agent, business } = await createBusiness("owner@example.com");

    const res = await agent.patch(`/businesses/${business.id}`).send({ name: "Berlin Cuts" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ business: { name: "Berlin Cuts", slug: "berlin-barbers" } });
  });

  it("forbids other users", async () => {
    const { business } = await createBusiness("owner@example.com");
    const stranger = await loggedInAgent("stranger@example.com");

    const res = await stranger.patch(`/businesses/${business.id}`).send({ name: "Hijacked" });

    expect(res.status).toBe(403);
  });

  it("rejects an id that isn't a UUID", async () => {
    const agent = await loggedInAgent("owner@example.com");

    const res = await agent.patch("/businesses/not-a-uuid").send({ name: "X" });

    expect(res.status).toBe(400);
  });
});
