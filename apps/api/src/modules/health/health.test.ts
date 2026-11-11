import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(createApp()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("unknown route", () => {
  it("returns 404 in the standard error shape", async () => {
    const res = await request(createApp()).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Route GET /does-not-exist not found" },
    });
  });
});
