import { Redis } from "ioredis";
import { config } from "./config.js";

/**
 * A new Redis client for one BullMQ queue or worker. ioredis reads everything from the URL
 * (host, port, password, database number, and TLS for rediss://).
 */
export function createRedisConnection(): Redis {
  return new Redis(config.REDIS_URL, {
    // Required by BullMQ workers: their blocking commands must keep retrying instead of failing.
    maxRetriesPerRequest: null,
  });
}

/**
 * A client for code on the request path (rate limiting). Unlike BullMQ's clients, a command
 * gives up after one retry or one second, so a request never hangs when Redis is down.
 * (Commands sent while it's still connecting wait for the connection instead of failing.)
 */
export function createRequestRedisClient(): Redis {
  return new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
  });
}
