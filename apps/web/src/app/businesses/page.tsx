import { listBusinessesQuerySchema } from "@booking/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessCard } from "@/components/business-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Input, Label, Select } from "@/components/ui/form";
import { queryString } from "@/lib/api";
import { CATEGORY_LABELS } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { BusinessCategory, Paginated, PublicBusiness } from "@/lib/types";

export const metadata: Metadata = { title: "Browse businesses" };

const PAGE_SIZE = 12;

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // Same schema the API validates with; a hand-edited URL with nonsense falls back to page 1.
  const parsed = listBusinessesQuerySchema.safeParse({
    search: typeof raw.search === "string" && raw.search.trim() ? raw.search : undefined,
    category: typeof raw.category === "string" && raw.category ? raw.category : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };

  // null = the API couldn't be reached; the page shows a message instead of crashing.
  const result = await serverGet<Paginated<PublicBusiness>>(
    `/businesses${queryString(query)}`,
  ).catch(() => null);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const pageLink = (page: number) =>
    `/businesses${queryString({ search: query.search, category: query.category, page })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Browse businesses</h1>

      <form
        action="/businesses"
        role="search"
        className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search">Name</Label>
          <Input id="search" name="search" defaultValue={query.search} placeholder="e.g. dental" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue={query.category ?? ""}>
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as BusinessCategory[]).map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit">Search</Button>
      </form>

      {!result ? (
        <Alert tone="error" title="Businesses couldn't be loaded">
          The booking service isn&apos;t reachable right now. Please try again in a moment.
        </Alert>
      ) : result.items.length === 0 ? (
        <EmptyState
          title="No businesses match"
          action={
            <ButtonLink href="/businesses" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        >
          Try another name or category.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result.total} {result.total === 1 ? "business" : "businesses"} found
          </p>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((business) => (
              <li key={business.id}>
                <BusinessCard business={business} />
              </li>
            ))}
          </ul>
          {totalPages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-center gap-4 text-sm">
              {query.page > 1 ? (
                <Link className="font-medium text-primary" href={pageLink(query.page - 1)}>
                  ← Previous
                </Link>
              ) : (
                <span className="text-muted-foreground">← Previous</span>
              )}
              <span>
                Page {query.page} of {totalPages}
              </span>
              {query.page < totalPages ? (
                <Link className="font-medium text-primary" href={pageLink(query.page + 1)}>
                  Next →
                </Link>
              ) : (
                <span className="text-muted-foreground">Next →</span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
