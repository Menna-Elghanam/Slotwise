import * as Sentry from "@sentry/node";
import { config } from "./config.js";

/** Turns on Sentry when a DSN is configured; without one, errors are only logged. */
export function initErrorTracking(): void {
  if (!config.SENTRY_DSN) {
    return;
  }
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    // Sentry 11 collects cookies, headers and request bodies by default. Ours carry session
    // tokens, passwords and personal data, so switch every category off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    // Errors only for v1; performance tracing can be added when there's traffic to measure.
    tracesSampleRate: 0,
  });
}

/** Reports an unexpected error. Expected ones (AppError, validation) are never sent. */
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  if (Sentry.isInitialized()) {
    Sentry.captureException(err, { extra: context });
  }
}

/** Sends what's still buffered before the process exits. */
export async function flushErrorTracking(): Promise<void> {
  if (Sentry.isInitialized()) {
    await Sentry.flush(2000);
  }
}
