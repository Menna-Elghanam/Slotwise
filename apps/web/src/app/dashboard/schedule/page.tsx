"use client";

import { useQuery } from "@tanstack/react-query";
import { fromZonedTime } from "date-fns-tz";
import Link from "next/link";
import { useState } from "react";
import { CancelBookingDialog } from "@/components/booking/cancel-dialog";
import { StaffPicker, type StaffOption } from "@/components/dashboard/staff-picker";
import { useToast } from "@/components/toast";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton, Spinner } from "@/components/ui/feedback";
import { api, errorMessage, queryString } from "@/lib/api";
import { bookingKeys, useRecordOutcome } from "@/lib/bookings";
import { formatCalendarDate, formatInZone, formatTime, shiftDate, todayIn } from "@/lib/format";
import type { StaffBooking } from "@/lib/types";
import { useManageableStaff } from "@/lib/workspace";

const DAYS_BACK = 7;
const DAYS_AHEAD = 14;

function BookingRow({ booking, timezone }: { booking: StaffBooking; timezone: string }) {
  const toast = useToast();
  const outcome = useRecordOutcome();
  const [cancelling, setCancelling] = useState(false);
  const started = new Date(booking.startsAt) <= new Date();
  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-4">
        <span className="w-12 shrink-0 font-semibold tabular-nums">
          {formatTime(booking.startsAt, timezone)}
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {booking.serviceName}
            <StatusBadge status={booking.status} />
          </p>
          <p className="text-sm text-muted-foreground">
            {booking.customerName} ·{" "}
            <a href={`mailto:${booking.customerEmail}`} className="hover:underline">
              {booking.customerEmail}
            </a>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {booking.status === "CONFIRMED" && started && (
          <>
            <Button
              size="sm"
              pending={outcome.isPending && outcome.variables?.status === "COMPLETED"}
              onClick={() =>
                outcome.mutate(
                  { id: booking.id, status: "COMPLETED" },
                  { onSuccess: () => toast("Marked as completed") },
                )
              }
            >
              Completed
            </Button>
            <Button
              size="sm"
              variant="secondary"
              pending={outcome.isPending && outcome.variables?.status === "NO_SHOW"}
              onClick={() =>
                outcome.mutate(
                  { id: booking.id, status: "NO_SHOW" },
                  { onSuccess: () => toast("Marked as no-show") },
                )
              }
            >
              No-show
            </Button>
          </>
        )}
        {active && !started && (
          <Button size="sm" variant="secondary" onClick={() => setCancelling(true)}>
            Cancel
          </Button>
        )}
        <Link
          href={`/bookings/${booking.id}`}
          className="inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted"
        >
          Details
        </Link>
      </div>
      {outcome.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(outcome.error)}
        </p>
      )}
      <CancelBookingDialog
        bookingId={booking.id}
        paid={booking.payment?.status === "PAID"}
        open={cancelling}
        onClose={() => setCancelling(false)}
      />
    </li>
  );
}

function Schedule({ staff }: { staff: StaffOption }) {
  const today = todayIn(staff.timezone);
  // From local midnight a week ago until local midnight after the last day, as exact moments.
  const from = fromZonedTime(
    `${shiftDate(today, -DAYS_BACK)}T00:00:00`,
    staff.timezone,
  ).toISOString();
  const to = fromZonedTime(
    `${shiftDate(today, DAYS_AHEAD + 1)}T00:00:00`,
    staff.timezone,
  ).toISOString();

  const bookings = useQuery({
    queryKey: [...bookingKeys.staff(staff.staffId), from, to],
    queryFn: () =>
      api
        .get<{ bookings: StaffBooking[] }>(
          `/staff/${staff.staffId}/bookings${queryString({ from, to })}`,
        )
        .then((r) => r.bookings),
  });

  if (bookings.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading schedule">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (bookings.isError) {
    return <Alert tone="error">{errorMessage(bookings.error)}</Alert>;
  }

  const now = new Date();
  const needsOutcome = bookings.data.filter(
    (b) => b.status === "CONFIRMED" && new Date(b.startsAt) <= now,
  );
  const upcoming = bookings.data.filter((b) => new Date(b.startsAt) > now);
  const byDay = new Map<string, StaffBooking[]>();
  for (const booking of upcoming) {
    const day = formatInZone(booking.startsAt, staff.timezone, "yyyy-MM-dd");
    byDay.set(day, [...(byDay.get(day) ?? []), booking]);
  }

  return (
    <div className="flex flex-col gap-6">
      {needsOutcome.length > 0 && (
        <section aria-labelledby="outcome-heading" className="flex flex-col gap-2">
          <h2 id="outcome-heading" className="font-semibold">
            How did these go?
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {needsOutcome.map((booking) => (
              <BookingRow key={booking.id} booking={booking} timezone={staff.timezone} />
            ))}
          </ul>
        </section>
      )}

      {byDay.size === 0 ? (
        <EmptyState title="Nothing booked in the next two weeks">
          New bookings appear here as soon as customers make them.
        </EmptyState>
      ) : (
        [...byDay.entries()].map(([day, dayBookings]) => (
          <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-2">
            <h2 id={`day-${day}`} className="font-semibold">
              {day === today ? "Today" : formatCalendarDate(day)}
            </h2>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
              {dayBookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} timezone={staff.timezone} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export default function SchedulePage() {
  const { staff, isPending } = useManageableStaff();
  const [selected, setSelected] = useState<string | null>(null);
  const current = staff.find((s) => s.staffId === selected) ?? staff[0];

  if (isPending) {
    return <Spinner />;
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Schedule</h1>
      {!current ? (
        <EmptyState title="No active staff yet">
          Add yourself or invite someone on the Team page, then bookings show up here.
        </EmptyState>
      ) : (
        <>
          <StaffPicker options={staff} value={current.staffId} onChange={setSelected} />
          <Schedule key={current.staffId} staff={current} />
        </>
      )}
    </div>
  );
}
