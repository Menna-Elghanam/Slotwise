"use client";

import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, Spinner } from "@/components/ui/feedback";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { useRefreshWorkspace } from "@/lib/workspace";

export function AcceptInvite() {
  const token = useSearchParams().get("token");
  const { data: user, isPending } = useMe();
  const refreshWorkspace = useRefreshWorkspace();
  const accept = useMutation({
    mutationFn: () => api.post("/staff/invites/accept", { token }),
    onSuccess: () => refreshWorkspace(),
  });
  const back = `/invites/accept?token=${encodeURIComponent(token ?? "")}`;

  if (!token) {
    return (
      <AuthCard title="Join a team">
        <Alert tone="error" title="This link is incomplete">
          Open the link from the invite email again.
        </Alert>
      </AuthCard>
    );
  }
  if (isPending) {
    return <Spinner />;
  }
  if (!user) {
    return (
      <AuthCard
        title="Join a team"
        description="Log in, or create an account, with the email address the invite was sent to."
      >
        <div className="flex gap-2">
          <ButtonLink href={`/login?next=${encodeURIComponent(back)}`}>Log in</ButtonLink>
          <ButtonLink href={`/register?next=${encodeURIComponent(back)}`} variant="secondary">
            Create account
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  const mismatch =
    accept.error instanceof ApiError && accept.error.code === "INVITE_EMAIL_MISMATCH";

  return (
    <AuthCard title="Join a team" description={`You're logged in as ${user.email}.`}>
      {accept.isSuccess ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title="You're on the team">
            Your schedule and working hours are in the dashboard.
          </Alert>
          <ButtonLink href="/dashboard/hours">Set your working hours</ButtonLink>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {accept.isError && (
            <Alert tone="error">
              {mismatch
                ? `This invite was sent to a different email address than ${user.email}. Log out and use the invited address.`
                : errorMessage(accept.error)}
            </Alert>
          )}
          <Button pending={accept.isPending} onClick={() => accept.mutate()}>
            Accept invite
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
