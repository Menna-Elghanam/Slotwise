/**
 * The end-to-end stack: the real API and a production build of the web app, on their own
 * ports, against their own database and Redis database, so a dev setup is never touched.
 */
export const API_PORT = 4100;
export const WEB_PORT = 3100;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const apiEnv = {
  NODE_ENV: "development" as const,
  LOG_LEVEL: "warn",
  PORT: String(API_PORT),
  DATABASE_URL: "postgresql://booking:booking@localhost:5440/booking_e2e",
  REDIS_URL: "redis://localhost:6379/2",
  JWT_ACCESS_SECRET: "e2e-only-secret-that-is-long-enough-1234567890",
  BCRYPT_ROUNDS: "4",
  // Not a real key: creating a Stripe session fails, which the app handles ("Pay now" later).
  STRIPE_SECRET_KEY: "sk_test_e2e_not_a_real_key",
  STRIPE_WEBHOOK_SECRET: "whsec_e2e_not_a_real_secret",
  WEB_URL,
  API_PATH_PREFIX: "/api",
  RATE_LIMIT_ENABLED: "false",
};

/** From the seed script (apps/api/src/scripts/seed.ts). */
export const DEMO = {
  password: "demo-password-123",
  customer: "customer@demo.local",
  owner: "owner@demo.local",
};
