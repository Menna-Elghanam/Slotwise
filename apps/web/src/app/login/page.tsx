import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

// The form reads ?next= from the URL, which Next.js requires to sit inside <Suspense>.
export default function LoginPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LoginForm />
    </Suspense>
  );
}
