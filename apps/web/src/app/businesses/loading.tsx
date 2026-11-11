import { Skeleton } from "@/components/ui/feedback";

/** Shown instantly while the server fetches the list (Next.js streams it in afterwards). */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading businesses">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  );
}
