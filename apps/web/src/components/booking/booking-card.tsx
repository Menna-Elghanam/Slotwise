"use client";

import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/lib/api";
import { canChange, canPay, usePayBooking } from "@/lib/bookings";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { CustomerBooking } from "@/lib/types";
import { Button, ButtonLink } from "../ui/button";
import { StatusBadge } from "../ui/badge";
import { Card } from "../ui/card";
import { CancelBookingDialog } from "./cancel-dialog";
import { RescheduleDialog } from "./reschedule-dialog";

/** One booking in "My bookings", with the actions that are allowed right now. */
export function BookingCard({ booking }: { booking: CustomerBooking }) {
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const pay = usePayBooking();
  const changeable = canChange(booking, "customer");
  const payable = canPay(booking);

  return (
    <Card className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/b/${booking.business.slug}`} className="font-semibold hover:underline">
            {booking.business.name}
          </Link>
          <StatusBadge status={booking.status} />
          {booking.payment?.status === "REFUNDED" && (
            <span className="text-xs text-muted-foreground">Refunded</span>
          )}
        </div>
        <p className="text-sm">
          {booking.service.name} with {booking.staffName} ·{" "}
          {formatMoney(booking.priceCents, booking.currency)}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(booking.startsAt, booking.business.timezone)}
        </p>
        {pay.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(pay.error)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {payable && (
          <Button size="sm" pending={pay.isPending} onClick={() => pay.mutate(booking.id)}>
            Pay now
          </Button>
        )}
        {changeable && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setDialog("reschedule")}>
              Reschedule
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setDialog("cancel")}>
              Cancel
            </Button>
          </>
        )}
        <ButtonLink href={`/bookings/${booking.id}`} size="sm" variant="ghost">
          Details
        </ButtonLink>
      </div>

      <CancelBookingDialog
        bookingId={booking.id}
        paid={booking.payment?.status === "PAID"}
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
      />
      <RescheduleDialog
        booking={booking}
        open={dialog === "reschedule"}
        onClose={() => setDialog(null)}
      />
    </Card>
  );
}
