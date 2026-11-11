"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser tab, created once (not on every render).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Retrying a 4xx can't help (not found, forbidden…); retry only network/server errors.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status < 500) && failureCount < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
