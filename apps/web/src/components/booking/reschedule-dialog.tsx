"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useRescheduleBooking } from "@/lib/bookings";
import { formatDateTime, todayIn } from "@/lib/format";
import type { CustomerBooking, PublicStaff, Slot } from "@/lib/types";
import { useToast } from "../toast";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Alert } from "../ui/feedback";
import { Label, Select } from "../ui/form";
import { SlotPicker } from "./slot-picker";

/** Move a booking to another free time (same service; the staff member may change). */
export function RescheduleDialog({
  booking,
  open,
  onClose,
}: {
  booking: CustomerBooking;
  open: boolean;
  onClose: () => void;
}) {
  const { business } = booking;
  const toast = useToast();
  const reschedule = useRescheduleBooking();
  const [staffId, setStaffId] = useState(booking.staffId);
  const [date, setDate] = useState(() => todayIn(business.timezone));
  const [slot, setSlot] = useState<Slot | null>(null);

  const staff = useQuery({
    queryKey: ["staff", business.id],
    queryFn: () => api.get<{ staff: PublicStaff[] }>(`/businesses/${business.id}/staff`),
    enabled: open,
  });
  const staffForService = (staff.data?.staff ?? []).filter((m) =>
    m.serviceIds.includes(booking.serviceId),
  );

  function close() {
    reschedule.reset();
    setSlot(null);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Move this booking"
      description={`Now: ${formatDateTime(booking.startsAt, business.timezone)} with ${booking.staffName}`}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reschedule-staff">With</Label>
        <Select
          id="reschedule-staff"
          value={staffId}
          onChange={(e) => {
            setStaffId(e.target.value);
            setSlot(null);
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

      {open && (
        <SlotPicker
          businessId={business.id}
          serviceId={booking.serviceId}
          staffId={staffId}
          timezone={business.timezone}
          maxDaysAhead={business.maxDaysAhead}
          date={date}
          onDateChange={(d) => {
            setDate(d);
            setSlot(null);
          }}
          selected={slot}
          onSelect={setSlot}
        />
      )}

      {reschedule.isError && <Alert tone="error">{errorMessage(reschedule.error)}</Alert>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={close}>
          Keep current time
        </Button>
        <Button
          disabled={!slot}
          pending={reschedule.isPending}
          onClick={() =>
            slot &&
            reschedule.mutate(
              { id: booking.id, startsAt: slot.startsAt, staffId: staffId || undefined },
              {
                onSuccess: () => {
                  toast(`Moved to ${formatDateTime(slot.startsAt, business.timezone)}`);
                  close();
                },
              },
            )
          }
        >
          Move booking
        </Button>
      </div>
    </Dialog>
  );
}
