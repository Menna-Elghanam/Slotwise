"use client";

import { registerSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/auth";

// The password rule is the API's own (from the shared sign-up schema), plus a confirmation.
const schema = z
  .object({ password: registerSchema.shape.password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ["confirm"] });

export function ResetPasswordForm() {
  const token = useSearchParams().get("token");
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await api.post("/auth/reset-password", { token, password });
      // Every session was ended by the reset, including this browser's.
      queryClient.setQueryData(queryKeys.me, null);
      setDone(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <Alert tone="error" title="This link is incomplete">
          Open the link from the email again, or{" "}
          <Link href="/forgot-password" className="underline">
            request a new one
          </Link>
          .
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Password changed">
            For your safety you've been logged out everywhere. Log in with your new password.
          </Alert>
          <Link href="/login" className="text-center font-medium text-primary hover:underline">
            Log in
          </Link>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
          {formError && (
            <Alert tone="error">
              {formError}{" "}
              <Link href="/forgot-password" className="underline">
                Request a new link
              </Link>
            </Alert>
          )}
          <Field
            label="New password"
            hint="At least 8 characters."
            error={errors.password?.message}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                {...register("password")}
              />
            )}
          </Field>
          <Field label="Repeat new password" error={errors.confirm?.message}>
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                {...register("confirm")}
              />
            )}
          </Field>
          <Button type="submit" pending={isSubmitting}>
            Save new password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
