import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { BookingStatus, BusinessCategory } from "./types";

/** 2500, "EUR" → "€25.00" */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
}

/**
 * Times are always shown in the business's time zone: the appointment happens there,
 * wherever the customer's laptop thinks it is.
 */
export function formatInZone(iso: string | Date, timezone: string, pattern: string): string {
  return formatInTimeZone(iso, timezone, pattern);
}

export function formatDateTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, "EEE d MMM yyyy, HH:mm");
}

export function formatTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, "HH:mm");
}

/** Today's date ("2027-07-05") in that time zone. */
export function todayIn(timezone: string, now = new Date()): string {
  return formatInTimeZone(now, timezone, "yyyy-MM-dd");
}

/**
 * The next `count` calendar dates from `firstDate`. Uses noon UTC so adding days can't
 * slip across midnight because of daylight saving.
 */
export function nextDates(firstDate: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftDate(firstDate, i));
}

/** "2027-07-05", -7 → "2027-06-28" */
export function shiftDate(date: string, days: number): string {
  return addDays(new Date(`${date}T12:00:00Z`), days)
    .toISOString()
    .slice(0, 10);
}

/** "2027-07-05" → "Mon 5 Jul" (a calendar date, so no time zone applies). */
export function formatCalendarDate(date: string): string {
  return formatInTimeZone(`${date}T12:00:00Z`, "UTC", "EEE d MMM");
}

/** 540 → "09:00" */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "09:30" → 570 */
export function timeToMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  BARBER: "Barbers",
  CLINIC: "Clinics",
  TUTOR: "Tutors",
  GYM: "Gyms",
  OTHER: "Other",
};

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "Awaiting payment",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
