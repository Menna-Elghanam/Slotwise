"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CancelBookingDialog } from "@/components/booking/cancel-dialog";
import { RescheduleDialog } from "@/components/booking/reschedule-dialog";
import { useToast } from "@/components/toast";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Spinner } from "@/components/ui/feedback";
import { api, ApiError, errorMessage } from "@/lib/api";
import { RequireAuth } from "@/lib/auth";
import { bookingKeys, canChange, canPay, usePayBooking, useRecordOutcome } from "@/lib/bookings";
import { formatDateTime, formatDuration, formatMoney, formatTime } from "@/lib/format";
import type { BookingDetail } from "@/lib/types";

/** Stripe's webhook usually lands within seconds; poll this many times, 2 s apart. */
const MAX_PAYMENT_POLLS = 15;

function PaymentNotice({ payment, booking }: { payment: string | null; booking: BookingDetail }) {
  if (payment === "success") {
    return booking.status === "PENDING" ? (
      <Alert title="Confirming your payment…">
        Stripe has your payment; we&apos;re waiting for its confirmation. This takes a few seconds.
      </Alert>
    ) : booking.status === "CONFIRMED" ? (
      <Alert tone="success" title="Payment received — you're booked!">
        A confirmation email is on its way, and we&apos;ll remind you a day before.
      </Alert>
    ) : null;
  }
  if ((payment === "cancelled" || payment === "unavailable") && booking.status === "PENDING") {
    return (
      <Alert title={payment === "cancelled" ? "Payment not completed" : "Payment couldn't start"}>
        Your time is held until{" "}
        {booking.expiresAt ? formatTime(booking.expiresAt, booking.business.timezone) : "soon"}. Pay
        before then to keep it.
      </Alert>
    );
  }
  return null;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function BookingDetailView() {
  const { id } = useParams<{ id: string }>();
  const payment = useSearchParams().get("payment");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const pay = usePayBooking();
  const outcome = useRecordOutcome();

  const query = useQuery({
    queryKey: bookingKeys.one(id),
    queryFn: () => api.get<{ booking: BookingDetail }>(`/bookings/${id}`).then((r) => r.booking),
    refetchInterval: (q) =>
      payment === "success" &&
      q.state.data?.status === "PENDING" &&
      q.state.dataUpdateCount < MAX_PAYMENT_POLLS
        ? 2000
        : false,
  });

  if (query.isPending) {
    return <Spinner label="Loading booking" />;
  }
  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Alert tone="error" title={notFound ? "Booking not found" : "The booking couldn't be loaded"}>
        {notFound ? "It may belong to another account." : errorMessage(query.error)}
      </Alert>
    );
  }

  const booking = query.data;
  const { business } = booking;
  const isBusiness = booking.viewer === "business";
  const started = new Date(booking.startsAt) <= new Date();
  const polls = queryClient.getQueryState(bookingKeys.one(id))?.dataUpdateCount ?? 0;
  const stillPolling =
    payment === "success" && booking.status === "PENDING" && polls >= MAX_PAYMENT_POLLS;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{booking.service.name}</h1>
        <StatusBadge status={booking.status} />
      </div>

      <PaymentNotice payment={payment} booking={booking} />
      {stillPolling && (
        <Alert title="Still waiting for Stripe">
          This is taking longer than usual. Refresh in a minute; if you were charged, the booking
          will be confirmed (or refunded automatically).
        </Alert>
      )}
      {pay.isError && <Alert tone="error">{errorMessage(pay.error)}</Alert>}
      {outcome.isError && <Alert tone="error">{errorMessage(outcome.error)}</Alert>}

      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="When">{formatDateTime(booking.startsAt, business.timezone)}</Detail>
            <Detail label="Duration">{formatDuration(booking.durationMinutes)}</Detail>
            <Detail label="Where">
              <Link
                href={`/b/${business.slug}`}
                className="font-medium text-primary hover:underline"
              >
                {business.name}
              </Link>
              <span className="block text-sm text-muted-foreground">{business.address}</span>
            </Detail>
            <Detail label="With">{booking.staffName}</Detail>
            <Detail label="Price">
              {formatMoney(booking.priceCents, booking.currency)}
              {booking.payment && (
                <span className="ml-2 text-sm text-muted-foreground">
                  ({booking.payment.status.toLowerCase()})
                </span>
              )}
            </Detail>
            {isBusiness && (
              <Detail label="Customer">
                {booking.customer.name}
                <a
                  href={`mailto:${booking.customer.email}`}
                  className="block text-sm text-primary hover:underline"
                >
                  {booking.customer.email}
                </a>
              </Detail>
            )}
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {!isBusiness && canPay(booking) && (
          <Button pending={pay.isPending} onClick={() => pay.mutate(booking.id)}>
            Pay now
          </Button>
        )}
        {!isBusiness && canChange(booking, "customer") && (
          <Button variant="secondary" onClick={() => setDialog("reschedule")}>
            Reschedule
          </Button>
        )}
        {canChange(booking, booking.viewer) && (
          <Button variant="secondary" onClick={() => setDialog("cancel")}>
            Cancel booking
          </Button>
        )}
        {isBusiness && booking.status === "CONFIRMED" && started && (
          <>
            <Button
              pending={outcome.isPending && outcome.variables?.status === "COMPLETED"}
              onClick={() =>
                outcome.mutate(
                  { id: booking.id, status: "COMPLETED" },
                  { onSuccess: () => toast("Marked as completed") },
                )
              }
            >
              Mark completed
            </Button>
            <Button
              variant="secondary"
              pending={outcome.isPending && outcome.variables?.status === "NO_SHOW"}
              onClick={() =>
                outcome.mutate(
                  { id: booking.id, status: "NO_SHOW" },
                  { onSuccess: () => toast("Marked as no-show") },
                )
              }
            >
              Mark no-show
            </Button>
          </>
        )}
        <ButtonLink href={isBusiness ? "/dashboard/schedule" : "/bookings"} variant="ghost">
          {isBusiness ? "Back to schedule" : "All my bookings"}
        </ButtonLink>
      </div>

      {!isBusiness && !canChange(booking, "customer") && canChange(booking, "business") && (
        <p className="text-sm text-muted-foreground">
          Changes are possible up to {business.cancelCutoffHours} hours before the start. Please
          contact {business.name} directly.
        </p>
      )}

      <CancelBookingDialog
        bookingId={booking.id}
        paid={booking.payment?.status === "PAID"}
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
      />
      {!isBusiness && (
        <RescheduleDialog
          booking={booking}
          open={dialog === "reschedule"}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export function BookingDetailPage() {
  return (
    <RequireAuth>
      <BookingDetailView />
    </RequireAuth>
  );
}
