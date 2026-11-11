import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        The page may have moved, or the business is no longer taking bookings.
      </p>
      <ButtonLink href="/businesses">Browse businesses</ButtonLink>
    </div>
  );
}
