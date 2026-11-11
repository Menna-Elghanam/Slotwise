"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { AuthCard } from "@/components/auth-card";
import { Alert, Spinner } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/auth";

export function VerifyEmail() {
  const token = useSearchParams().get("token");
  const queryClient = useQueryClient();
  const verify = useMutation({
    mutationFn: (value: string) => api.post("/auth/verify-email", { token: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  // The token can be used once. React runs effects twice in development, so remember that
  // this page already sent it.
  const sent = useRef(false);
  useEffect(() => {
    if (token && !sent.current) {
      sent.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <AuthCard title="Confirm your email">
      {!token ? (
        <Alert tone="error" title="This link is incomplete">
          Open the link from the email again.
        </Alert>
      ) : verify.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="Email confirmed">
            Thanks! Your email address is confirmed.
          </Alert>
          <Link href="/businesses" className="text-center font-medium text-primary hover:underline">
            Find a business to book
          </Link>
        </div>
      ) : verify.isError ? (
        <Alert tone="error" title="This link didn't work">
          {errorMessage(verify.error)} Log in and use &ldquo;Send a new link&rdquo; on{" "}
          <Link href="/bookings" className="underline">
            My bookings
          </Link>
          .
        </Alert>
      ) : (
        <Spinner label="Confirming" />
      )}
    </AuthCard>
  );
}
