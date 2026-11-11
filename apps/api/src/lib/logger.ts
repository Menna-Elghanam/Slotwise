import { pino, type LoggerOptions } from "pino";
import { config } from "./config.js";

export const loggerOptions: LoggerOptions = {
  // Keep test output clean.
  level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
  // pino-http logs request and response headers. Without this, every log line would contain
  // the user's login tokens, and anyone who can read the logs could take over the session.
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'req.headers["stripe-signature"]',
      'res.headers["set-cookie"]',
    ],
    censor: "[redacted]",
  },
};

export const logger = pino(loggerOptions);
