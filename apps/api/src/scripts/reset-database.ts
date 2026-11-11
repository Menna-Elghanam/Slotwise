/**
 * Empties the database for end-to-end tests: `pnpm --filter api db:reset` (then seed).
 * Refuses to touch anything but a database whose name ends in _e2e or _test, so it can
 * never wipe development or production data by accident.
 */

const url = process.env.DATABASE_URL;
const name = url && URL.canParse(url) ? new URL(url).pathname.slice(1) : "";
if (!/_(e2e|test)$/.test(name)) {
  console.error(`Refusing to reset "${name}": only *_e2e or *_test databases can be reset.`);
  process.exit(1);
}

// Loaded only after the check: static imports would run first (they're hoisted) and
// connect before the guard could stop anything.
const { resetDb } = await import("../test/db.js");
const { db } = await import("../lib/db.js");

await resetDb();
console.log(`Database "${name}" emptied.`);
await db.$disconnect();
