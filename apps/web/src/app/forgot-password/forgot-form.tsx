"use client";

import { forgotPasswordSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post("/auth/forgot-password", values);
      setSentTo(values.email);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      }
    >
      {sentTo ? (
        // The same message whether or not the account exists: the API is built so this page
        // can't be used to find out who has an account.
        <Alert tone="success" title="Check your inbox">
          If an account exists for {sentTo}, a reset link is on its way. It works for one hour.
        </Alert>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Email" error={errors.email?.message}>
            {(control) => (
              <Input {...control} type="email" autoComplete="email" {...register("email")} />
            )}
          </Field>
          <Button type="submit" pending={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
