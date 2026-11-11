import cookieParser from "cookie-parser";
import express from "express";
import { pinoHttp } from "pino-http";
import { config } from "./lib/config.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { logger } from "./lib/logger.js";
import { rateLimit } from "./lib/rate-limit.js";
import { securityHeaders } from "./lib/security-headers.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { availabilityRouter } from "./modules/availability/availability.routes.js";
import { bookingsRouter } from "./modules/bookings/bookings.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";
import { docsRouter } from "./modules/docs/docs.routes.js";
import { meRouter } from "./modules/me/me.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { webhookRouter } from "./modules/payments/webhook.routes.js";
import { servicesRouter } from "./modules/services/services.routes.js";
import { slotsRouter } from "./modules/slots/slots.routes.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";

// Building the app separately from starting it lets tests call it without opening a port.
export function createApp() {
  const app = express();

  // Don't advertise the framework to attackers.
  app.disable("x-powered-by");
  // Behind a proxy, take the visitor's IP from X-Forwarded-For (only from that many hops).
  app.set("trust proxy", config.TRUST_PROXY_HOPS);

  app.use(pinoHttp({ logger }));
  app.use(securityHeaders);
  // Before express.json(): webhooks need the unparsed body to verify their signature.
  // Also before the general rate limit: Stripe may send bursts and retries on its own.
  app.use(webhookRouter);
  app.use(rateLimit({ name: "all", limit: 300, windowSeconds: 60 }));
  app.use(express.json());
  app.use(cookieParser());

  app.use("/health", healthRouter);
  app.use(docsRouter);
  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.use(meRouter);
  app.use("/businesses", businessesRouter);
  app.use(servicesRouter);
  app.use(staffRouter);
  app.use(availabilityRouter);
  app.use(slotsRouter);
  app.use(bookingsRouter);
  app.use(paymentsRouter);

  // Order matters: these run only when no route above handled the request.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
