import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/** Slots start on a fixed grid of local time: 09:00, 09:15, 09:30, … */
export const SLOT_STEP_MINUTES = 15;
const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WorkingRange {
  dayOfWeek: number; // 0 = Sunday
  startMinute: number; // local minutes since midnight
  endMinute: number;
}

export interface BusyInterval {
  startsAt: Date;
  endsAt: Date; // exclusive
}

export interface SlotInput {
  /** Local calendar date in the business timezone, e.g. "2027-07-05". */
  date: string;
  timezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  now: Date;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  /** One staff member's weekly hours. */
  workingHours: WorkingRange[];
  /** That staff member's bookings (startsAt → blockedUntil) and time off. */
  busy: BusyInterval[];
}

/** "2027-07-05" → UTC milliseconds of that calendar day, for timezone-free day arithmetic. */
function calendarDay(date: string): number {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

const pad = (n: number) => String(n).padStart(2, "0");

function localLabel(date: string, minuteOfDay: number): string {
  return `${date}T${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
}

/** Local wall-clock time on `date` → UTC instant. Minute 1440 means midnight at the end of the day. */
export function localTimeToUtc(date: string, minuteOfDay: number, timezone: string): Date {
  const dayOffset = Math.floor(minuteOfDay / MINUTES_PER_DAY);
  const day = new Date(calendarDay(date) + dayOffset * MS_PER_DAY).toISOString().slice(0, 10);
  return fromZonedTime(`${localLabel(day, minuteOfDay % MINUTES_PER_DAY)}:00`, timezone);
}

/**
 * Free start times (UTC) for one staff member on one local date.
 * Pure function: no database, no clock — everything comes in through `input`.
 */
export function calculateSlots(input: SlotInput): Date[] {
  const { date, timezone, now } = input;

  // Booking window: today (in the business's timezone) up to maxDaysAhead.
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const daysAhead = (calendarDay(date) - calendarDay(today)) / MS_PER_DAY;
  if (daysAhead < 0 || daysAhead > input.maxDaysAhead) {
    return [];
  }

  const earliestStart = addMinutes(now, input.minNoticeMinutes);
  const blockedMinutes = input.durationMinutes + input.bufferMinutes;
  const dayOfWeek = new Date(calendarDay(date)).getUTCDay();
  const slots: Date[] = [];

  for (const range of input.workingHours.filter((r) => r.dayOfWeek === dayOfWeek)) {
    const rangeEnd = localTimeToUtc(date, range.endMinute, timezone);
    const firstStart = Math.ceil(range.startMinute / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;

    for (let minute = firstStart; minute < range.endMinute; minute += SLOT_STEP_MINUTES) {
      const start = localTimeToUtc(date, minute, timezone);

      // On the spring-forward day, local times like 02:30 don't exist: skip them.
      if (formatInTimeZone(start, timezone, "yyyy-MM-dd'T'HH:mm") !== localLabel(date, minute)) {
        continue;
      }

      // The service plus its buffer must finish inside the working range.
      const blockedUntil = addMinutes(start, blockedMinutes);
      if (blockedUntil.getTime() > rangeEnd.getTime()) {
        break;
      }

      if (start.getTime() < earliestStart.getTime()) {
        continue;
      }

      // Half-open overlap check, so back-to-back bookings are allowed (same as the DB constraint).
      const overlapsBusy = input.busy.some(
        (b) =>
          start.getTime() < b.endsAt.getTime() && blockedUntil.getTime() > b.startsAt.getTime(),
      );
      if (!overlapsBusy) {
        slots.push(start);
      }
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime());
}
