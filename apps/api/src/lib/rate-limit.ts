import type { RequestHandler } from "express";
import type { Redis } from "ioredis";
import { config } from "./config.js";
import { AppError } from "./errors.js";
import { logger } from "./logger.js";
import { createRequestRedisClient } from "./redis.js";

interface RateLimitOptions {
  /** Separates the counters of different limits. */
  name: string;
  /** Requests allowed per window, per IP address. */
  limit: number;
  windowSeconds: number;
  enabled?: boolean;
}

// Created on first use, so tests and scripts that never rate-limit don't open a connection.
let client: Redis | undefined;
const redis = () => (client ??= createRequestRedisClient());

/**
 * Fixed-window limit per IP address, counted in Redis so every API instance shares the
 * same counters. If Redis is down the request is let through: a broken limiter shouldn't
 * take the whole API down with it.
 */
export function rateLimit({
  name,
  limit,
  windowSeconds,
  enabled = config.RATE_LIMIT_ENABLED,
}: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    if (!enabled) {
      next();
      return;
    }

    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rate-limit:${name}:${req.ip ?? "unknown"}:${window}`;

    let count: number;
    try {
      // MULTI runs both commands together; the key cleans itself up after the window.
      const results = await redis().multi().incr(key).expire(key, windowSeconds).exec();
      count = Number(results?.[0]?.[1] ?? 0);
    } catch (err) {
      logger.warn({ err }, "Rate limiter unavailable; allowing request");
      next();
      return;
    }

    if (count > limit) {
      const secondsLeft = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
      res.setHeader("Retry-After", String(secondsLeft));
      next(new AppError(429, "RATE_LIMITED", "Too many requests, please try again later"));
      return;
    }
    next();
  };
}
