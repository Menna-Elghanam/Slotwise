import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import { isExclusionViolation } from "./db.js";

/** Shaped like the errors Prisma 7 + @prisma/adapter-pg actually throw (checked by hand). */
function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("Database error", {
    code,
    clientVersion: Prisma.prismaVersion.client,
    meta,
  });
}

const withPostgresCode = (pgCode: string) =>
  prismaError("P2039", { driverAdapterError: { cause: { code: pgCode } } });

describe("isExclusionViolation", () => {
  it("detects Postgres error 23P01 under Prisma's generic error", () => {
    expect(isExclusionViolation(withPostgresCode("23P01"))).toBe(true);
  });

  it("ignores other Postgres errors", () => {
    expect(isExclusionViolation(withPostgresCode("23505"))).toBe(false);
  });

  it("ignores Prisma errors without a driver error", () => {
    expect(isExclusionViolation(prismaError("P2002", { target: ["email"] }))).toBe(false);
  });

  it("ignores plain errors that merely mention the constraint", () => {
    expect(isExclusionViolation(new Error("Booking_no_overlap"))).toBe(false);
  });
});
