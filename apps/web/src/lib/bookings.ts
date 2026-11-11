"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { subHours } from "date-fns";
import { api } from "./api";
import type { Booking, BookingBusiness, PaymentStatus } from "./types";

type BookingLike = Pick<Booking, "status" | "startsAt" | "expiresAt"> & {
  business: Pick<BookingBusiness, "cancelCutoffHours">;
  payment: { status: PaymentStatus } | null;
};

/**
 * The same rules the API enforces, so the UI only offers actions that will work. (The API
 * still decides: a stale page can't cancel too late.)
 */
export function canChange(booking: BookingLike, viewer: "customer" | "business", now = new Date()) {
  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const upcoming = new Date(booking.startsAt) > now;
  if (!active || !upcoming) {
    return false;
  }
  // The cutoff only protects paid appointments; an unpaid hold can always be released.
  if (viewer === "business" || booking.status === "PENDING") {
    return true;
  }
  return now <= subHours(new Date(booking.startsAt), booking.business.cancelCutoffHours);
}

export function canPay(booking: BookingLike, now = new Date()) {
  return (
    booking.status === "PENDING" &&
    booking.payment?.status !== "PAID" &&
    booking.expiresAt !== null &&
    new Date(booking.expiresAt) > now
  );
}

export const bookingKeys = {
  all: ["bookings"] as const,
  mine: (scope: "upcoming" | "past") => ["bookings", "me", scope] as const,
  one: (id: string) => ["bookings", "one", id] as const,
  staff: (staffId: string) => ["bookings", "staff", staffId] as const,
};

/** After any change, every list and page showing bookings (and free times) must refresh. */
function useInvalidateBookings() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: bookingKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["slots"] }),
    ]);
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (id: string) => api.post(`/bookings/${id}/cancel`),
    onSuccess: invalidate,
  });
}

export function useRescheduleBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, startsAt, staffId }: { id: string; startsAt: string; staffId?: string }) =>
      api.post(`/bookings/${id}/reschedule`, { startsAt, staffId }),
    onSuccess: invalidate,
  });
}

export function useRecordOutcome() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "COMPLETED" | "NO_SHOW" }) =>
      api.post(`/bookings/${id}/outcome`, { status }),
    onSuccess: invalidate,
  });
}

/** Opens (or reopens) Stripe Checkout for an unpaid booking. */
export function usePayBooking() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ checkoutUrl: string }>(`/bookings/${id}/checkout`),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
  });
}
