import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
