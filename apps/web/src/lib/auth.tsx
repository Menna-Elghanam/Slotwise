"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "@/components/ui/feedback";
import { api, ApiError } from "./api";
import type { User, Workspace } from "./types";

export const queryKeys = {
  me: ["me"] as const,
  workspace: ["workspace"] as const,
};

/** The logged-in user, or null. Not logged in is a normal state, not an error. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        const { user } = await api.get<{ user: User }>("/auth/me");
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** The business the user owns and where they work as staff. */
export function useWorkspace(enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspace,
    queryFn: () => api.get<Workspace>("/me/workspace"),
    enabled,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => {
      // Drop every cached answer: the next user of this browser mustn't see them.
      queryClient.clear();
      queryClient.setQueryData(queryKeys.me, null);
      router.push("/");
    },
  });
}

/** Where to send someone after logging in: only paths on this site (no open redirect). */
export function safeNextPath(next: string | null): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/bookings";
}

/**
 * Shows its children only to logged-in users (and admins, if asked); others are sent to
 * the login page and come back here afterwards. The API checks access on every request
 * anyway; this is about not showing pages that can't work.
 */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { data: user, isPending, isError } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !isError && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isPending, isError, user, router, pathname]);

  if (isPending || (!user && !isError)) {
    return <Spinner label="Checking your session" />;
  }
  if (isError) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-destructive">
        We couldn&apos;t reach the server. Please refresh the page.
      </p>
    );
  }
  if (admin && !user?.isAdmin) {
    return (
      <p role="alert" className="py-10 text-center text-sm text-muted-foreground">
        This page is for platform admins.
      </p>
    );
  }
  return children;
}
