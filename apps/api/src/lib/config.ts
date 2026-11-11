import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  // Short secrets can be brute-forced, which would let anyone forge login tokens.
  JWT_ACCESS_SECRET: z.string().min(32),
  // Cost of password hashing. 12 is the secure default; tests lower it to stay fast.
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  // v1 runs in Stripe test mode only; refusing live keys means no real money can move by mistake.
  STRIPE_SECRET_KEY: z.string().startsWith("sk_test_", "Use a Stripe test-mode key (sk_test_...)"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_"),
  // The web app's address, for Stripe's redirects and the links in emails.
  WEB_URL: z.url(),
  // Any SMTP server. Locally that's Mailpit from docker-compose (inbox at localhost:8025).
  SMTP_URL: z.url().default("smtp://localhost:1025"),
  EMAIL_FROM: z.string().min(3).default("Booking Platform <no-reply@booking.local>"),
  // Optional: without them, image uploads are switched off and everything else still works.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  // Off in tests, which send many requests from one address on purpose.
  RATE_LIMIT_ENABLED: z.stringbool().default(true),
  // How many proxies sit in front of the API (1 on Railway/Render), so req.ip is the
  // visitor's address and not the proxy's. 0 locally.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // The path prefix the browser uses to reach the API. "/api" when the web app proxies
  // /api/* to it; the refresh cookie's path must include it or the browser won't send it.
  API_PATH_PREFIX: z
    .string()
    .regex(/^(\/[\w-]+)*$/, 'Use "" or a path like "/api"')
    .default(""),
  // Optional: report unexpected errors to Sentry.
  SENTRY_DSN: z.url().optional(),
});

const parsed = envSchema.safeParse(process.env);

// Fail fast: a missing or invalid variable should stop startup, not break a request later.
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const config = parsed.data;
