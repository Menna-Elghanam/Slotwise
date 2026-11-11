"use client";

import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, queryString } from "@/lib/api";
import { formatCalendarDate, formatTime, nextDates, todayIn } from "@/lib/format";
import type { Slot, SlotsResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Alert, EmptyState, Skeleton } from "../ui/feedback";

/** How many days the date strip offers (never more than the business allows). */
const DAYS_SHOWN = 14;

export function slotsQueryKey(
  businessId: string,
  serviceId: string,
  staffId: string,
  date: string,
) {
  return ["slots", businessId, serviceId, staffId, date] as const;
}

interface SlotPickerProps {
  businessId: string;
  serviceId: string;
  /** "" = any staff member. */
  staffId: string;
  timezone: string;
  maxDaysAhead: number;
  date: string;
  onDateChange: (date: string) => void;
  selected: Slot | null;
  onSelect: (slot: Slot) => void;
}

/**
 * Pick a day, then a free start time. Times come from the API's slot calculation and are
 * shown in the business's time zone.
 */
export function SlotPicker({
  businessId,
  serviceId,
  staffId,
  timezone,
  maxDaysAhead,
  date,
  onDateChange,
  selected,
  onSelect,
}: SlotPickerProps) {
  const dates = nextDates(todayIn(timezone), Math.min(DAYS_SHOWN, maxDaysAhead + 1));

  const slots = useQuery({
    queryKey: slotsQueryKey(businessId, serviceId, staffId, date),
    queryFn: () =>
      api.get<SlotsResponse>(
        `/businesses/${businessId}/slots${queryString({ serviceId, staffId, date })}`,
      ),
    // Free times change as people book; don't show a minute-old list as current.
    staleTime: 15_000,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* min-w-0: a fieldset refuses to shrink below its content by default, which would
          stop the day strip from scrolling and widen the whole page. */}
      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">Day</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => onDateChange(d)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-sm",
                d === date
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-muted",
              )}
            >
              {formatCalendarDate(d)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-sm font-medium">
          Time <span className="font-normal text-muted-foreground">({timezone})</span>
        </legend>
        {slots.isPending ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Loading times">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : slots.isError ? (
          <Alert tone="error" title="Free times couldn't be loaded">
            <p>{errorMessage(slots.error)}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void slots.refetch()}
            >
              Try again
            </Button>
          </Alert>
        ) : slots.data.slots.length === 0 ? (
          <EmptyState title="No free times on this day">Try another day.</EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.data.slots.map((slot) => {
              const isSelected = selected?.startsAt === slot.startsAt;
              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(slot)}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-card hover:border-primary",
                  )}
                >
                  {formatTime(slot.startsAt, timezone)}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}
