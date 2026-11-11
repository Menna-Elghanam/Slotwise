import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";
import { app, bookableBusiness, loggedInAgent } from "../../test/helpers.js";

beforeEach(async () => {
  await resetDb();
});

async function adminAgent() {
  const agent = await loggedInAgent("admin@example.com");
  await db.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: true } });
  return agent;
}

describe("admin routes", () => {
  it("are closed to logged-out users and to non-admins", async () => {
    const user = await loggedInAgent("user@example.com");

    const anonymous = await request(app).get("/admin/stats");
    const nonAdmin = await user.get("/admin/stats");

    expect(anonymous.status).toBe(401);
    expect(nonAdmin.status).toBe(403);
  });

  it("stop working as soon as admin rights are removed", async () => {
    const admin = await adminAgent();
    await db.user.update({ where: { email: "admin@example.com" }, data: { isAdmin: false } });

    const res = await admin.get("/admin/stats");

    expect(res.status).toBe(403);
  });

  it("show platform stats", async () => {
    await bookableBusiness();
    const admin = await adminAgent();

    const res = await admin.get("/admin/stats");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      stats: { users: 2, businesses: { ACTIVE: 1 }, bookings: {}, paidCents: 0 },
    });
  });

  it("list users without password hashes, with search", async () => {
    await loggedInAgent("ali@example.com");
    const admin = await adminAgent();

    const res = await admin.get("/admin/users?search=ALI");

    expect(res.body).toMatchObject({ total: 1, items: [{ email: "ali@example.com" }] });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("suspend a business, which hides it from customers, and reactivate it", async () => {
    const { business } = await bookableBusiness();
    const admin = await adminAgent();

    const suspended = await admin.patch(`/admin/businesses/${business.id}`).send({
      status: "SUSPENDED",
    });
    const publicPage = await request(app).get(`/businesses/${business.slug}`);
    const listed = await admin.get("/admin/businesses?status=SUSPENDED");
    const reactivated = await admin.patch(`/admin/businesses/${business.id}`).send({
      status: "ACTIVE",
    });

    expect(suspended.body).toMatchObject({ business: { status: "SUSPENDED" } });
    expect(publicPage.status).toBe(404);
    expect(listed.body).toMatchObject({
      total: 1,
      items: [{ id: business.id, owner: { email: "owner@example.com" } }],
    });
    expect(reactivated.body).toMatchObject({ business: { status: "ACTIVE" } });
  });

  it("return 404 for an unknown business", async () => {
    const admin = await adminAgent();

    const res = await admin
      .patch("/admin/businesses/00000000-0000-4000-8000-000000000000")
      .send({ status: "SUSPENDED" });

    expect(res.status).toBe(404);
  });
});
