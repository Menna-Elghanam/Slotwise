import type { CreateTimeOffInput, SetWorkingHoursInput } from "@booking/shared";
import { db } from "../../lib/db.js";
import { AppError } from "../../lib/errors.js";
import { assertCanManageStaff } from "../staff/staff.service.js";

const rangeSelect = { dayOfWeek: true, startMinute: true, endMinute: true } as const;

export async function getWorkingHours(staffId: string) {
  const staff = await db.staffMember.findUnique({ where: { id: staffId }, select: { id: true } });
  if (!staff) {
    throw new AppError(404, "STAFF_NOT_FOUND", "Staff member not found");
  }
  return db.workingHours.findMany({
    where: { staffId },
    select: rangeSelect,
    orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
  });
}

/** Replaces the whole weekly schedule in one transaction. */
export async function setWorkingHours(
  staffId: string,
  userId: string,
  ranges: SetWorkingHoursInput["ranges"],
) {
  await assertCanManageStaff(staffId, userId);
  await db.$transaction([
    db.workingHours.deleteMany({ where: { staffId } }),
    db.workingHours.createMany({ data: ranges.map((range) => ({ ...range, staffId })) }),
  ]);
  return getWorkingHours(staffId);
}

/** Current and upcoming time off (past entries no longer matter for booking). */
export async function listTimeOff(staffId: string, userId: string) {
  await assertCanManageStaff(staffId, userId);
  return db.timeOff.findMany({
    where: { staffId, endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
  });
}

export async function createTimeOff(staffId: string, userId: string, input: CreateTimeOffInput) {
  await assertCanManageStaff(staffId, userId);
  return db.timeOff.create({ data: { ...input, staffId } });
}

export async function deleteTimeOff(timeOffId: string, userId: string): Promise<void> {
  const timeOff = await db.timeOff.findUnique({ where: { id: timeOffId } });
  if (!timeOff) {
    throw new AppError(404, "TIME_OFF_NOT_FOUND", "Time off not found");
  }
  await assertCanManageStaff(timeOff.staffId, userId);
  await db.timeOff.delete({ where: { id: timeOffId } });
}
