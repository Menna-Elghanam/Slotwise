import { Writable } from "node:stream";
import express from "express";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../test/helpers.js";
import { errorHandler } from "./errors.js";
import { loggerOptions } from "./logger.js";
import { rateLimit } from "./rate-limit.js";

describe("rate limiting", () => {
  /** A tiny app with its own counter, so earlier runs and other tests can't interfere. */
  function limitedApp(limit: number) {
    const limited = express();
    limited.use(pinoHttp({ logger: pino({ level: "silent" }) }));
    limited.use(
      rateLimit({
        name: `test-${Date.now()}-${Math.random()}`,
        limit,
        windowSeconds: 3600,
        enabled: true,
      }),
    );
    limited.get("/", (_req, res) => {
      res.json({ ok: true });
    });
    limited.use(errorHandler);
    return limited;
  }

  it("answers 429 with Retry-After once the limit is used up", async () => {
    const limited = limitedApp(2);

    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await request(limited).get("/")).status);
    }
    const blocked = await request(limited).get("/");

    expect(statuses).toEqual([200, 200, 429]);
    expect(blocked.body).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });
});

describe("security headers", () => {
  it("are set on every response, and the framework isn't advertised", async () => {
    const res = await request(app).get("/health");

    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("request logging", () => {
  it("never writes login cookies to the logs", async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const logged = express();
    logged.use(pinoHttp({ logger: pino({ ...loggerOptions, level: "info" }, sink) }));
    logged.get("/", (_req, res) => {
      res.cookie("access_token", "secret-response-token").json({ ok: true });
    });

    await request(logged).get("/").set("Cookie", "access_token=secret-request-token");

    const output = lines.join("");
    expect(output).toContain("[redacted]");
    expect(output).not.toContain("secret-request-token");
    expect(output).not.toContain("secret-response-token");
  });
});
