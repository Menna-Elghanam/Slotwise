"use client";

import { createTimeOffSchema, setWorkingHoursSchema } from "@booking/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fromZonedTime } from "date-fns-tz";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { StaffPicker, type StaffOption } from "@/components/dashboard/staff-picker";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Spinner } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { formatDateTime, minutesToTime, timeToMinutes, WEEKDAYS } from "@/lib/format";
import type { TimeOff, WorkingHoursRange } from "@/lib/types";
import { useManageableStaff } from "@/lib/workspace";

/** Monday first, the way most calendars outside the US show a week. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface EditableRange {
  key: number;
  dayOfWeek: number;
  start: string;
  end: string;
}

let nextKey = 0;
const toEditable = (r: WorkingHoursRange): EditableRange => ({
  key: nextKey++,
  dayOfWeek: r.dayOfWeek,
  start: minutesToTime(r.startMinute),
  // Midnight (1440) can't be shown in a time field; 23:59 stands for it (see submit()).
  end: r.endMinute === 24 * 60 ? "23:59" : minutesToTime(r.endMinute),
});

function WeeklyHoursEditor({
  staff,
  initial,
}: {
  staff: StaffOption;
  initial: WorkingHoursRange[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [ranges, setRanges] = useState(() => initial.map(toEditable));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: { ranges: WorkingHoursRange[] }) =>
      api.put(`/staff/${staff.staffId}/working-hours`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["working-hours", staff.staffId] });
      toast("Working hours saved");
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function update(key: number, change: Partial<EditableRange>) {
    setRanges((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function submit() {
    // "24:00" can't be typed into a time field, so 23:59 counts as "until midnight".
    const payload = {
      ranges: ranges.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startMinute: timeToMinutes(r.start),
        endMinute: r.end === "23:59" ? 24 * 60 : timeToMinutes(r.end),
      })),
    };
    const parsed = setWorkingHoursSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the times");
      return;
    }
    setError(null);
    save.mutate(payload);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly working hours</CardTitle>
        <CardDescription>In {staff.timezone}. Leave a day empty when not working.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {WEEK_ORDER.map((day) => {
          const dayRanges = ranges.filter((r) => r.dayOfWeek === day);
          return (
            <fieldset
              key={day}
              className="flex flex-col gap-2 border-b border-border pb-4 last:border-0"
            >
              <legend className="mb-1 text-sm font-medium">{WEEKDAYS[day]}</legend>
              {dayRanges.length === 0 && <p className="text-sm text-muted-foreground">Closed</p>}
              {dayRanges.map((range) => (
                <div key={range.key} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`start-${range.key}`}>
                    {WEEKDAYS[day]} from
                  </label>
                  <Input
                    id={`start-${range.key}`}
                    type="time"
                    value={range.start}
                    onChange={(e) => update(range.key, { start: e.target.value })}
                    className="w-32"
                  />
                  <span aria-hidden>–</span>
                  <label className="sr-only" htmlFor={`end-${range.key}`}>
                    {WEEKDAYS[day]} until
                  </label>
                  <Input
                    id={`end-${range.key}`}
                    type="time"
                    value={range.end}
                    onChange={(e) => update(range.key, { end: e.target.value })}
                    className="w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${WEEKDAYS[day]} ${range.start}–${range.end}`}
                    onClick={() =>
                      setRanges((current) => current.filter((r) => r.key !== range.key))
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="link"
                size="sm"
                className="self-start px-0"
                onClick={() =>
                  setRanges((current) => [
                    ...current,
                    { key: nextKey++, dayOfWeek: day, start: "09:00", end: "17:00" },
                  ])
                }
              >
                <Plus aria-hidden className="size-4" />
                Add hours on {WEEKDAYS[day]}
              </Button>
            </fieldset>
          );
        })}
        {error && <Alert tone="error">{error}</Alert>}
        <Button className="self-start" pending={save.isPending} onClick={submit}>
          Save hours
        </Button>
      </CardContent>
    </Card>
  );
}

function TimeOffCard({ staff }: { staff: StaffOption }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = ["time-off", staff.staffId];
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<{ timeOff: TimeOff[] }>(`/staff/${staff.staffId}/time-off`).then((r) => r.timeOff),
  });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: ["slots"] }),
    ]);
  const add = useMutation({
    mutationFn: (body: { startsAt: string; endsAt: string; reason?: string }) =>
      api.post(`/staff/${staff.staffId}/time-off`, body),
    onSuccess: async () => {
      await refresh();
      setStart("");
      setEnd("");
      setReason("");
      toast("Time off added");
    },
    onError: (err) => setFormError(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/time-off/${id}`),
    onSuccess: async () => {
      await refresh();
      toast("Time off removed");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!start || !end) {
      setFormError("Choose when the time off starts and ends");
      return;
    }
    // The inputs are wall-clock times at the business; convert them to exact moments there.
    const body = {
      startsAt: fromZonedTime(start, staff.timezone).toISOString(),
      endsAt: fromZonedTime(end, staff.timezone).toISOString(),
      reason: reason.trim() || undefined,
    };
    const parsed = createTimeOffSchema.safeParse(body);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please check the dates");
      return;
    }
    setFormError(null);
    add.mutate(body);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Time off</CardTitle>
        <CardDescription>
          Holidays, appointments, sick days: no bookings in these periods.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <Alert tone="error">{errorMessage(list.error)}</Alert>
        ) : list.data.length === 0 ? (
          <EmptyState title="No time off planned" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {list.data.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {formatDateTime(entry.startsAt, staff.timezone)} –{" "}
                  {formatDateTime(entry.endsAt, staff.timezone)}
                  {entry.reason && <span className="text-muted-foreground"> · {entry.reason}</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove this time off"
                  pending={remove.isPending && remove.variables === entry.id}
                  onClick={() => remove.mutate(entry.id)}
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field label="From">
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            )}
          </Field>
          <Field label="Until">
            {(control) => (
              <Input
                {...control}
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            )}
          </Field>
          <Field label="Reason (optional, only you see it)" className="sm:col-span-2">
            {(control) => (
              <Input {...control} value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          {formError && (
            <Alert tone="error" className="sm:col-span-2">
              {formError}
            </Alert>
          )}
          <Button type="submit" pending={add.isPending} className="justify-self-start">
            Add time off
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function HoursPage() {
  const { staff, isPending } = useManageableStaff();
  const [selected, setSelected] = useState<string | null>(null);
  const current = staff.find((s) => s.staffId === selected) ?? staff[0];

  const hours = useQuery({
    queryKey: ["working-hours", current?.staffId],
    queryFn: () =>
      api.get<{ ranges: WorkingHoursRange[] }>(`/staff/${current?.staffId}/working-hours`),
    enabled: Boolean(current),
  });

  if (isPending) {
    return <Spinner />;
  }
  if (!current) {
    return (
      <EmptyState title="No active staff yet">
        Add yourself or invite someone on the Team page first.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Hours &amp; time off</h1>
      <StaffPicker options={staff} value={current.staffId} onChange={setSelected} />
      {hours.isPending ? (
        <Spinner label="Loading hours" />
      ) : hours.isError ? (
        <Alert tone="error">{errorMessage(hours.error)}</Alert>
      ) : (
        // A new key per staff member resets the editor's local state when switching.
        <WeeklyHoursEditor key={current.staffId} staff={current} initial={hours.data.ranges} />
      )}
      <TimeOffCard key={`off-${current.staffId}`} staff={current} />
    </div>
  );
}
