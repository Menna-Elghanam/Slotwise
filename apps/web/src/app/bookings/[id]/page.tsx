import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { BookingDetailPage } from "./booking-detail";

export const metadata: Metadata = { title: "Booking" };

export default function Page() {
  return (
    <Suspense fallback={<Spinner />}>
      <BookingDetailPage />
    </Suspense>
  );
}
