import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Join a team" };

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AcceptInvite />
    </Suspense>
  );
}
