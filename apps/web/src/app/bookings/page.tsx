import type { Metadata } from "next";
import { MyBookings } from "./my-bookings";

export const metadata: Metadata = { title: "My bookings" };

export default function MyBookingsPage() {
  return <MyBookings />;
}
