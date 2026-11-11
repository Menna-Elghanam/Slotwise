import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "../../test/db.js";
import { emailInbox } from "../../test/emails.js";
import { app, loggedInAgent } from "../../test/helpers.js";

const inbox = emailInbox();
const email = "ali@example.com";
const oldPassword = "correct-horse-battery";
const newPassword = "a-brand-new-password";

beforeEach(async () => {
  await resetDb();
  await inbox.clear();
});

afterAll(async () => {
  await inbox.close();
});

describe("email verification", () => {
  it("sends a link on sign-up that verifies the address once", async () => {
    const agent = await loggedInAgent(email);
    const token = await inbox.tokenSentTo(email);

    const verified = await request(app).post("/auth/verify-email").send({ token });
    const again = await request(app).post("/auth/verify-email").send({ token });
    const me = await agent.get("/auth/me");

    expect(verified.status).toBe(204);
    expect(again.status).toBe(400);
    expect(again.body).toMatchObject({ error: { code: "INVALID_TOKEN" } });
    expect(me.body).toMatchObject({ user: { emailVerified: true } });
  });

  it("rejects a made-up token", async () => {
    const res = await request(app)
      .post("/auth/verify-email")
      .send({ token: "x".repeat(43) });

    expect(res.status).toBe(400);
  });

  it("resends the link, but not to a verified address", async () => {
    const agent = await loggedInAgent(email);

    const resent = await agent.post("/auth/resend-verification");
    await request(app)
      .post("/auth/verify-email")
      .send({ token: await inbox.tokenSentTo(email) });
    const afterVerified = await agent.post("/auth/resend-verification");

    expect(resent.status).toBe(204);
    expect(await inbox.messagesTo(email)).toHaveLength(2);
    expect(afterVerified.status).toBe(409);
  });

  it("requires login to resend", async () => {
    const res = await request(app).post("/auth/resend-verification");

    expect(res.status).toBe(401);
  });
});

describe("password reset", () => {
  it("answers the same for unknown emails and sends nothing", async () => {
    const res = await request(app)
      .post("/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(204);
    expect(await inbox.messagesTo("nobody@example.com")).toEqual([]);
  });

  it("resets the password with the emailed link and ends every session", async () => {
    const agent = await loggedInAgent(email);
    await request(app).post("/auth/forgot-password").send({ email });
    const token = await inbox.tokenSentTo(email);

    const reset = await request(app)
      .post("/auth/reset-password")
      .send({ token, password: newPassword });
    const reused = await request(app)
      .post("/auth/reset-password")
      .send({ token, password: "yet-another-password" });
    const oldLogin = await request(app).post("/auth/login").send({ email, password: oldPassword });
    const newLogin = await request(app).post("/auth/login").send({ email, password: newPassword });
    const oldSession = await agent.post("/auth/refresh");

    expect(reset.status).toBe(204);
    expect(reused.status).toBe(400);
    expect(oldLogin.status).toBe(401);
    expect(newLogin.status).toBe(200);
    expect(oldSession.status).toBe(401);
  });

  it("doesn't accept a verification token as a reset token", async () => {
    await loggedInAgent(email);
    const verifyToken = await inbox.tokenSentTo(email);

    const res = await request(app)
      .post("/auth/reset-password")
      .send({ token: verifyToken, password: newPassword });

    expect(res.status).toBe(400);
  });
});
