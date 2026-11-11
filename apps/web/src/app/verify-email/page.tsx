import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { VerifyEmail } from "./verify-email";

export const metadata: Metadata = { title: "Confirm email" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <VerifyEmail />
    </Suspense>
  );
}
