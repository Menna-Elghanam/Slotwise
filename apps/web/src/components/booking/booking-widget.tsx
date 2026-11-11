"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError, errorMessage, queryString } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { formatDateTime, formatDuration, formatMoney, todayIn } from "@/lib/format";
import type { Booking, PublicBusiness, PublicService, PublicStaff, Slot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Alert } from "../ui/feedback";
import { Label, Select } from "../ui/form";
import { SlotPicker } from "./slot-picker";

interface BookingWidgetProps {
  business: PublicBusiness;
  services: PublicService[];
  staff: PublicStaff[];
  /** Selection from the URL, e.g. after coming back from the login page. */
  initial: { serviceId?: string; staffId?: string; date?: string };
}

export function BookingWidget({ business, services, staff, initial }: BookingWidgetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user } = useMe();

  const [serviceId, setServiceId] = useState(
    services.some((s) => s.id === initial.serviceId) ? (initial.serviceId ?? "") : "",
  );
  const [staffId, setStaffId] = useState(
    staff.some((s) => s.id === initial.staffId) ? (initial.staffId ?? "") : "",
  );
  const [date, setDate] = useState(() => {
    const today = todayIn(business.timezone);
    // Only a well-formed date that isn't in the past (ISO dates compare correctly as text).
    const fromUrl = initial.date;
    return fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) && fromUrl >= today ? fromUrl : today;
  });
  const [slot, setSlot] = useState<Slot | null>(null);

  const service = services.find((s) => s.id === serviceId);
  const staffForService = staff.filter((s) => s.serviceIds.includes(serviceId));

  /** Keeps the choice in the URL, so a reload or the login round trip doesn't lose it. */
  function remember(next: { serviceId: string; staffId: string; date: string }) {
    router.replace(
      `${pathname}${queryString({ service: next.serviceId, staff: next.staffId, date: next.date })}`,
      {
        scroll: false,
      },
    );
  }

  const book = useMutation({
    mutationFn: async (chosen: Slot) => {
      const { booking } = await api.post<{ booking: Booking }>("/bookings", {
        serviceId,
        staffId: staffId || undefined,
        startsAt: chosen.startsAt,
      });
      try {
        const { checkoutUrl } = await api.post<{ checkoutUrl: string }>(
          `/bookings/${booking.id}/checkout`,
        );
        return { booking, checkoutUrl };
      } catch {
        // The slot is held; the customer can retry paying from the booking page.
        return { booking, checkoutUrl: null };
      }
    },
    onSuccess: ({ booking, checkoutUrl }) => {
      if (checkoutUrl) {
        // Stripe's hosted payment page; Stripe sends the customer back to /bookings/:id.
        window.location.assign(checkoutUrl);
      } else {
        router.push(`/bookings/${booking.id}?payment=unavailable`);
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "SLOT_TAKEN") {
        // Someone was faster: show the fresh list and let the customer choose again.
        setSlot(null);
        void queryClient.invalidateQueries({ queryKey: ["slots", business.id] });
      }
    },
  });

  function confirm() {
    if (!slot) {
      return;
    }
    if (!user) {
      const back = `${pathname}${queryString({ service: serviceId, staff: staffId, date })}`;
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    book.mutate(slot);
  }

  if (services.length === 0) {
    return <Alert title="No services yet">This business hasn&apos;t published any services.</Alert>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Book an appointment</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Service</legend>
          <div className="flex flex-col gap-2">
            {services.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 text-sm",
                  s.id === serviceId
                    ? "border-primary bg-accent/50"
                    : "border-input hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="service"
                    value={s.id}
                    checked={s.id === serviceId}
                    onChange={() => {
                      // A staff member who doesn't offer the new service can't stay selected.
                      const keepStaff = staff.some(
                        (m) => m.id === staffId && m.serviceIds.includes(s.id),
                      );
                      const nextStaff = keepStaff ? staffId : "";
                      setServiceId(s.id);
                      setStaffId(nextStaff);
                      setSlot(null);
                      remember({ serviceId: s.id, staffId: nextStaff, date });
                    }}
                    className="accent-primary"
                  />
                  <span>
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-muted-foreground">
                      {formatDuration(s.durationMinutes)}
                    </span>
                  </span>
                </span>
                <span className="font-semibold">{formatMoney(s.priceCents, s.currency)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {service && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff">With</Label>
              <Select
                id="staff"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setSlot(null);
                  remember({ serviceId, staffId: e.target.value, date });
                }}
              >
                <option value="">Anyone available</option>
                {staffForService.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
            </div>

            <SlotPicker
              businessId={business.id}
              serviceId={serviceId}
              staffId={staffId}
              timezone={business.timezone}
              maxDaysAhead={business.maxDaysAhead}
              date={date}
              onDateChange={(d) => {
                setDate(d);
                setSlot(null);
                remember({ serviceId, staffId, date: d });
              }}
              selected={slot}
              onSelect={setSlot}
            />
          </>
        )}

        {book.isError && (
          <Alert tone="error" title="Booking didn't go through">
            {errorMessage(book.error)}
          </Alert>
        )}

        {service && slot && (
          <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm" aria-live="polite">
            <p>
              <span className="font-medium">{service.name}</span> ·{" "}
              {formatDateTime(slot.startsAt, business.timezone)} ·{" "}
              {formatMoney(service.priceCents, service.currency)}
            </p>
            <Button size="lg" pending={book.isPending} onClick={confirm}>
              {user ? "Book and pay" : "Log in to book"}
            </Button>
            <p className="text-xs text-muted-foreground">
              The time is held for you while you pay. Free cancellation up to{" "}
              {business.cancelCutoffHours} hours before.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
