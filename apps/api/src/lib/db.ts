import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { config } from "./config.js";

// One shared client: each instance opens its own connection pool.
const adapter = new PrismaPg({ connectionString: config.DATABASE_URL });

export const db = new PrismaClient({ adapter });

/** True when a write failed because of a UNIQUE constraint (Prisma error P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// Prisma has no dedicated code for exclusion constraints; the Postgres error sits underneath.
const postgresErrorMetaSchema = z.object({
  driverAdapterError: z.object({ cause: z.object({ code: z.string() }) }),
});

/**
 * True when a write failed because of an EXCLUSION constraint (Postgres error 23P01).
 * Our only one is `Booking_no_overlap`; if another is added, also check the message.
 */
export function isExclusionViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }
  const meta = postgresErrorMetaSchema.safeParse(err.meta);
  return meta.success && meta.data.driverAdapterError.cause.code === "23P01";
}
