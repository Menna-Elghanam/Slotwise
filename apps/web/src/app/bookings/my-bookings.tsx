"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookingCard } from "@/components/booking/booking-card";
import { ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { api, errorMessage } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";
import { bookingKeys } from "@/lib/bookings";
import type { CustomerBooking } from "@/lib/types";
import { cn } from "@/lib/utils";

type Scope = "upcoming" | "past";

function BookingList({ scope }: { scope: Scope }) {
  const bookings = useQuery({
    queryKey: bookingKeys.mine(scope),
    queryFn: () =>
      api
        .get<{ bookings: CustomerBooking[] }>(`/bookings/me?scope=${scope}`)
        .then((r) => r.bookings),
  });

  if (bookings.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading bookings">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (bookings.isError) {
    return (
      <Alert tone="error" title="Your bookings couldn't be loaded">
        {errorMessage(bookings.error)}
      </Alert>
    );
  }
  if (bookings.data.length === 0) {
    return scope === "upcoming" ? (
      <EmptyState
        title="No upcoming bookings"
        action={<ButtonLink href="/businesses">Find a business</ButtonLink>}
      >
        When you book an appointment, it shows up here.
      </EmptyState>
    ) : (
      <EmptyState title="No past bookings">Cancelled and finished bookings appear here.</EmptyState>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {bookings.data.map((booking) => (
        <li key={booking.id}>
          <BookingCard booking={booking} />
        </li>
      ))}
    </ul>
  );
}

export function MyBookings() {
  const [scope, setScope] = useState<Scope>("upcoming");

  return (
    <RequireAuth>
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">My bookings</h1>
        <VerifyEmailBanner />
        <div className="flex gap-2" role="group" aria-label="Show">
          {(["upcoming", "past"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={scope === option}
              onClick={() => setScope(option)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium",
                scope === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-border",
              )}
            >
              {option === "upcoming" ? "Upcoming" : "Past"}
            </button>
          ))}
        </div>
        <BookingList scope={scope} />
      </div>
    </RequireAuth>
  );
}
