import { describe, expect, it } from "vitest";
import { calculateSlots, type SlotInput } from "./slots.calculator.js";

// 2027-07-05 is a Monday; Berlin is UTC+2 in summer.
const base: SlotInput = {
  date: "2027-07-05",
  timezone: "Europe/Berlin",
  durationMinutes: 30,
  bufferMinutes: 0,
  now: new Date("2027-07-01T00:00:00Z"),
  minNoticeMinutes: 120,
  maxDaysAhead: 60,
  workingHours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }], // 09:00–10:00
  busy: [],
};

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());
const utc = (time: string, date = "2027-07-05") => `${date}T${time}:00.000Z`;

describe("calculateSlots", () => {
  it("returns 15-minute starts that fit inside the working range", () => {
    // 09:00, 09:15, 09:30 Berlin = 07:00, 07:15, 07:30 UTC. 09:45 + 30 min would end after 10:00.
    expect(iso(calculateSlots(base))).toEqual([utc("07:00"), utc("07:15"), utc("07:30")]);
  });

  it("makes the buffer fit inside the range too", () => {
    const slots = calculateSlots({ ...base, bufferMinutes: 10 });

    expect(iso(slots)).toEqual([utc("07:00"), utc("07:15")]);
  });

  it("handles several ranges per day (lunch break)", () => {
    const slots = calculateSlots({
      ...base,
      workingHours: [
        { dayOfWeek: 1, startMinute: 540, endMinute: 570 }, // 09:00–09:30
        { dayOfWeek: 1, startMinute: 840, endMinute: 870 }, // 14:00–14:30
      ],
    });

    expect(iso(slots)).toEqual([utc("07:00"), utc("12:00")]);
  });

  it("returns nothing on a day without working hours", () => {
    expect(calculateSlots({ ...base, date: "2027-07-06" })).toEqual([]);
  });

  it("skips slots overlapping a booking but allows back-to-back", () => {
    const slots = calculateSlots({
      ...base,
      busy: [{ startsAt: new Date(utc("07:15")), endsAt: new Date(utc("07:30")) }],
    });

    // 07:00 would end 07:30 (overlaps), 07:15 overlaps, 07:30 starts exactly when the booking ends.
    expect(iso(slots)).toEqual([utc("07:30")]);
  });

  it("returns nothing during time off", () => {
    const slots = calculateSlots({
      ...base,
      busy: [{ startsAt: new Date(utc("00:00")), endsAt: new Date(utc("23:59")) }],
    });

    expect(slots).toEqual([]);
  });

  it("respects the minimum notice", () => {
    // Now = 07:00 Berlin, notice 2h15 → first allowed start is 09:15 Berlin.
    const slots = calculateSlots({ ...base, now: new Date(utc("05:00")), minNoticeMinutes: 135 });

    expect(iso(slots)).toEqual([utc("07:15"), utc("07:30")]);
  });

  it("returns nothing for past dates or beyond the booking window", () => {
    expect(calculateSlots({ ...base, now: new Date("2027-07-10T00:00:00Z") })).toEqual([]);
    expect(calculateSlots({ ...base, maxDaysAhead: 3 })).toEqual([]);
  });

  it("uses the winter offset in winter (UTC+1)", () => {
    // 2027-01-11 is a Monday.
    const slots = calculateSlots({
      ...base,
      date: "2027-01-11",
      now: new Date("2027-01-01T00:00:00Z"),
    });

    expect(iso(slots)[0]).toBe(utc("08:00", "2027-01-11"));
  });

  it("skips local times that don't exist on the spring-forward day", () => {
    // Berlin 2027-03-28 (Sunday): clocks jump from 02:00 to 03:00.
    const slots = calculateSlots({
      ...base,
      date: "2027-03-28",
      now: new Date("2027-03-01T00:00:00Z"),
      workingHours: [{ dayOfWeek: 0, startMinute: 60, endMinute: 240 }], // 01:00–04:00 local
    });

    // 01:00–01:45 local (UTC+1) then 03:00–03:30 local (UTC+2); 02:xx never exists.
    expect(iso(slots)).toEqual(
      ["00:00", "00:15", "00:30", "00:45", "01:00", "01:15", "01:30"].map((t) =>
        utc(t, "2027-03-28"),
      ),
    );
  });
});
