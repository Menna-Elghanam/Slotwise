import type { RequestHandler } from "express";
import { config } from "./config.js";

/**
 * The response headers that matter for a JSON API. (Helmet would set these and more, most
 * of which only matter for HTML pages; a few lines are easier to explain than a dependency.)
 */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  // Browsers must not guess a different content type than the one we send.
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Nobody may embed API responses in a frame (clickjacking).
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  // Only pages on our own site may read our responses as resources.
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  if (config.NODE_ENV === "production") {
    // Remember to use HTTPS for a year; only sensible once HTTPS is guaranteed.
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
};
