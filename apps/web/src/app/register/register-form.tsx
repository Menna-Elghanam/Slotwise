"use client";

import { registerSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { queryKeys, safeNextPath } from "@/lib/auth";
import { applyServerErrors } from "@/lib/forms";
import type { User } from "@/lib/types";

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = useSearchParams().get("next");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await api.post<{ user: User }>("/auth/register", values);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, user);
      router.replace(safeNextPath(next));
    } catch (err) {
      if (!applyServerErrors(err, setError)) {
        setFormError(errorMessage(err));
      }
    }
  });

  return (
    <AuthCard
      title="Create your account"
      description="Book appointments, or set up your own business afterwards."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-medium text-primary hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Name" error={errors.name?.message}>
          {(control) => <Input {...control} autoComplete="name" {...register("name")} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(control) => (
            <Input {...control} type="email" autoComplete="email" {...register("email")} />
          )}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password?.message}>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
          )}
        </Field>
        <Button type="submit" pending={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
