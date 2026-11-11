"use client";

import { Button } from "@/components/ui/button";

/** Catches unexpected errors in any page, so the user gets a way out instead of a blank page. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Please try again. If it keeps happening, come back in a few minutes.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
