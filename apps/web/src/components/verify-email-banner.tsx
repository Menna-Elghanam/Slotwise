"use client";

import { useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useToast } from "./toast";
import { Button } from "./ui/button";
import { Alert } from "./ui/feedback";

/** Reminds a user who hasn't confirmed their email yet, with a way to get a new link. */
export function VerifyEmailBanner() {
  const { data: user } = useMe();
  const toast = useToast();
  const resend = useMutation({
    mutationFn: () => api.post("/auth/resend-verification"),
    onSuccess: () => toast(`A new link is on its way to ${user?.email ?? "your inbox"}`),
    onError: (err) => toast(errorMessage(err), "error"),
  });

  if (!user || user.emailVerified) {
    return null;
  }
  return (
    <Alert title="Please confirm your email address">
      <p>We sent a link to {user.email}. Confirming it makes sure booking emails reach you.</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        pending={resend.isPending}
        disabled={resend.isSuccess}
        onClick={() => resend.mutate()}
      >
        {resend.isSuccess ? "Link sent" : "Send a new link"}
      </Button>
    </Alert>
  );
}
