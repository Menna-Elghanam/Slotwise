export * from "./admin.ts";
export * from "./auth.ts";
export * from "./availability.ts";
export * from "./booking.ts";
export * from "./business.ts";
export * from "./service.ts";
export * from "./slots.ts";
export * from "./staff.ts";

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
  "EXPIRED",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
