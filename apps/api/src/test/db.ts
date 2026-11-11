import { db } from "../lib/db.js";

/** Empties all data. CASCADE also clears every table that references User. */
export async function resetDb(): Promise<void> {
  await db.$executeRaw`TRUNCATE "User", "StripeEvent" CASCADE`;
}
