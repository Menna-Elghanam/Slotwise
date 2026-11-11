import { createApp } from "./app.js";
import { startBookingExpiryWorker } from "./jobs/booking-expiry.js";
import { startEmailWorker } from "./jobs/email-worker.js";
import { startRefundWorker } from "./jobs/refunds.js";
import { config } from "./lib/config.js";
import { db } from "./lib/db.js";
import { flushErrorTracking, initErrorTracking } from "./lib/error-tracking.js";
import { logger } from "./lib/logger.js";

initErrorTracking();

// v1 runs the job workers inside the API process; they can move to their own process later.
const workers = [startBookingExpiryWorker(), startEmailWorker(), await startRefundWorker()];

const server = createApp().listen(config.PORT, (error) => {
  if (error) {
    throw error;
  }
  logger.info(`API listening on http://localhost:${config.PORT}`);
});

/**
 * Hosts send SIGTERM before replacing the process on every deploy. Stop taking requests,
 * let running requests and jobs finish, then close connections, instead of cutting a
 * booking or a payment update off halfway.
 */
async function shutDown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");
  // A stuck request or job must not keep the old process alive forever.
  setTimeout(() => process.exit(1), 10_000).unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all(workers.map((worker) => worker.close()));
  await db.$disconnect();
  await flushErrorTracking();
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => void shutDown(signal));
}
