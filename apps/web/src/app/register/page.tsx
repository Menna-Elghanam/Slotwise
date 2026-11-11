import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/feedback";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Sign up" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RegisterForm />
    </Suspense>
  );
}
