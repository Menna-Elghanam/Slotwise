import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { db } from "../../lib/db.js";
import { resetDb } from "../../test/db.js";

const app = createApp();
const ali = { name: "Ali", email: "ali@example.com", password: "correct-horse-battery" };

function getRefreshCookie(res: request.Response): string {
  const cookie = res.get("Set-Cookie")?.find((c) => c.startsWith("refresh_token="));
  if (!cookie) {
    throw new Error("No refresh_token cookie in response");
  }
  return cookie.split(";")[0] ?? "";
}

beforeEach(async () => {
  await resetDb();
});

describe("POST /auth/register", () => {
  it("creates the user, sets cookies and never returns the password hash", async () => {
    const agent = request.agent(app);

    const res = await agent.post("/auth/register").send(ali);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: {
        id: expect.any(String),
        email: ali.email,
        name: ali.name,
        isAdmin: false,
        emailVerified: false,
      },
    });

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
  });

  it("rejects a duplicate email, ignoring case", async () => {
    await request(app).post("/auth/register").send(ali);

    const res = await request(app)
      .post("/auth/register")
      .send({ ...ali, email: "ALI@example.com" });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "EMAIL_TAKEN" } });
  });

  it("rejects invalid input with field errors", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "", email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        details: { name: expect.any(Array), email: expect.any(Array), password: expect.any(Array) },
      },
    });
  });
});

describe("POST /auth/login", () => {
  it("logs in with the right password", async () => {
    await request(app).post("/auth/register").send(ali);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: ali.email, password: ali.password });

    expect(res.status).toBe(200);
    expect(getRefreshCookie(res)).toMatch(/^refresh_token=.+/);
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    await request(app).post("/auth/register").send(ali);

    const wrongPassword = await request(app)
      .post("/auth/login")
      .send({ email: ali.email, password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe("GET /auth/me", () => {
  it("rejects requests without a login", async () => {
    const res = await request(app).get("/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the token and ends all sessions when an old token is reused", async () => {
    const registered = await request(app).post("/auth/register").send(ali);
    const firstToken = getRefreshCookie(registered);

    const refreshed = await request(app).post("/auth/refresh").set("Cookie", firstToken);
    expect(refreshed.status).toBe(204);
    const secondToken = getRefreshCookie(refreshed);

    // Reusing the first (now revoked) token a minute later looks like theft...
    await db.refreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });
    const reused = await request(app).post("/auth/refresh").set("Cookie", firstToken);
    expect(reused.status).toBe(401);

    // ...so the legitimate newer token is revoked too.
    const afterReuse = await request(app).post("/auth/refresh").set("Cookie", secondToken);
    expect(afterReuse.status).toBe(401);
  });

  it("treats a reuse right after rotation as two tabs racing, not theft", async () => {
    const registered = await request(app).post("/auth/register").send(ali);
    const firstToken = getRefreshCookie(registered);
    const refreshed = await request(app).post("/auth/refresh").set("Cookie", firstToken);
    const secondToken = getRefreshCookie(refreshed);

    // The second tab's request, sent with the same old cookie a moment later.
    const raced = await request(app).post("/auth/refresh").set("Cookie", firstToken);
    const newerStillWorks = await request(app).post("/auth/refresh").set("Cookie", secondToken);

    expect(raced.status).toBe(401);
    expect(newerStillWorks.status).toBe(204);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the refresh token and clears the cookies", async () => {
    const registered = await request(app).post("/auth/register").send(ali);
    const refreshToken = getRefreshCookie(registered);

    const res = await request(app).post("/auth/logout").set("Cookie", refreshToken);
    expect(res.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/auth/refresh").set("Cookie", refreshToken);
    expect(refreshAfterLogout.status).toBe(401);
  });
});
