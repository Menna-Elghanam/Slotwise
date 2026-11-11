"use client";

import { errorMessage } from "@/lib/api";
import { useCancelBooking } from "@/lib/bookings";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Alert } from "../ui/feedback";

export function CancelBookingDialog({
  bookingId,
  paid,
  open,
  onClose,
}: {
  bookingId: string;
  paid: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const cancel = useCancelBooking();
  const toast = useToast();

  return (
    <Dialog
      open={open}
      onClose={() => {
        cancel.reset();
        onClose();
      }}
      title="Cancel this booking?"
      description={
        paid
          ? "The time is released and the payment is refunded to the card automatically."
          : "The time is released for someone else."
      }
    >
      {cancel.isError && <Alert tone="error">{errorMessage(cancel.error)}</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Keep booking
        </Button>
        <Button
          variant="destructive"
          pending={cancel.isPending}
          onClick={() =>
            cancel.mutate(bookingId, {
              onSuccess: () => {
                toast(paid ? "Booking cancelled — refund on its way" : "Booking cancelled");
                onClose();
              },
            })
          }
        >
          Cancel booking
        </Button>
      </div>
    </Dialog>
  );
}
