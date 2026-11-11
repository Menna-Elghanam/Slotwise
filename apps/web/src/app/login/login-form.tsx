"use client";

import { loginSchema } from "@booking/shared";
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
import type { User } from "@/lib/types";

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = useSearchParams().get("next");
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user } = await api.post<{ user: User }>("/auth/login", values);
      // A different person may have used this browser: forget their cached data.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, user);
      router.replace(safeNextPath(next));
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New here?{" "}
          <Link
            href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {(control) => (
            <Input {...control} type="email" autoComplete="email" {...register("email")} />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
          )}
        </Field>
        <Button type="submit" pending={isSubmitting}>
          Log in
        </Button>
        <Link href="/forgot-password" className="text-center text-sm text-primary hover:underline">
          Forgot your password?
        </Link>
      </form>
    </AuthCard>
  );
}
