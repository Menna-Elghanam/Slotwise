import { Search } from "lucide-react";
import Link from "next/link";
import { BusinessCard } from "@/components/business-card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { CATEGORY_LABELS } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { BusinessCategory, Paginated, PublicBusiness } from "@/lib/types";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as BusinessCategory[];

async function loadFeatured() {
  try {
    return await serverGet<Paginated<PublicBusiness>>("/businesses?pageSize=6");
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const featured = await loadFeatured();

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-center gap-6 rounded-2xl bg-accent px-6 py-14 text-center">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-accent-foreground sm:text-4xl">
          Book your next appointment in under a minute
        </h1>
        <p className="max-w-xl text-accent-foreground/80">
          Barbers, clinics, tutors and gyms: see real free times, pick one, and pay securely.
        </p>
        {/* A plain GET form: works before any JavaScript has loaded. */}
        <form action="/businesses" role="search" className="flex w-full max-w-md gap-2">
          <label htmlFor="home-search" className="sr-only">
            Search businesses
          </label>
          {/* min-w-0: inputs have a minimum width of their own, too wide for a phone next to the button. */}
          <Input
            id="home-search"
            name="search"
            placeholder="Search by name, e.g. Kreuzberg"
            className="min-w-0 flex-1"
          />
          <Button type="submit">
            <Search aria-hidden className="size-4" />
            Search
          </Button>
        </form>
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Categories">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={`/businesses?category=${category}`}
                className="rounded-full bg-card px-4 py-1.5 text-sm font-medium hover:bg-muted"
              >
                {CATEGORY_LABELS[category]}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="featured-heading">
        <div className="flex items-end justify-between">
          <h2 id="featured-heading" className="text-xl font-semibold">
            Businesses taking bookings
          </h2>
          <Link href="/businesses" className="text-sm font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        {!featured ? (
          <Alert tone="error" title="Businesses couldn't be loaded">
            The booking service isn&apos;t reachable right now. Please try again in a moment.
          </Alert>
        ) : featured.items.length === 0 ? (
          <EmptyState title="No businesses yet">
            Once a business has a service, staff and working hours, it appears here.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.map((business) => (
              <li key={business.id}>
                <BusinessCard business={business} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
