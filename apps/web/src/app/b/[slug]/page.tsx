import { Clock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookingWidget } from "@/components/booking/booking-widget";
import { BusinessLogo } from "@/components/business-card";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { CATEGORY_LABELS, formatDuration, formatMoney } from "@/lib/format";
import { serverGet } from "@/lib/server-api";
import type { PublicBusiness, PublicService, PublicStaff } from "@/lib/types";

async function loadBusiness(slug: string) {
  try {
    const { business } = await serverGet<{ business: PublicBusiness }>(
      `/businesses/${encodeURIComponent(slug)}`,
    );
    return business;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const business = await loadBusiness((await params).slug);
  return { title: business.name, description: business.description ?? undefined };
}

export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const business = await loadBusiness(slug);
  const [{ services }, { staff }] = await Promise.all([
    serverGet<{ services: PublicService[] }>(`/businesses/${business.id}/services`),
    serverGet<{ staff: PublicStaff[] }>(`/businesses/${business.id}/staff`),
  ]);
  const pick = (key: string) => (typeof query[key] === "string" ? query[key] : undefined);

  return (
    <div className="flex flex-col gap-8">
      {business.coverUrl && (
        // Decorative: the heading below names the business, so alt="" keeps screen readers quiet.
        <img
          src={business.coverUrl}
          alt=""
          className="h-48 w-full rounded-2xl object-cover sm:h-64"
        />
      )}

      <div className="flex items-start gap-4">
        <BusinessLogo business={business} size={64} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{business.name}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge>{CATEGORY_LABELS[business.category]}</Badge>
            <span className="flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {business.address}
            </span>
          </div>
          {business.description && <p className="max-w-2xl">{business.description}</p>}
        </div>
      </div>

      {/* minmax(0, …): grid items may shrink below their content (the day strip scrolls
          inside the card instead of widening the page on phones). */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-labelledby="services-heading" className="flex flex-col gap-3">
          <h2 id="services-heading" className="text-lg font-semibold">
            Services
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {services.map((service) => (
              <li key={service.id} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{service.name}</p>
                  {service.description && (
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  )}
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock aria-hidden className="size-3.5" />
                    {formatDuration(service.durationMinutes)}
                  </p>
                </div>
                <p className="font-semibold">{formatMoney(service.priceCents, service.currency)}</p>
              </li>
            ))}
          </ul>
          {staff.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Team: {staff.map((member) => member.name).join(", ")}
            </p>
          )}
        </section>

        <BookingWidget
          business={business}
          services={services}
          staff={staff}
          initial={{ serviceId: pick("service"), staffId: pick("staff"), date: pick("date") }}
        />
      </div>
    </div>
  );
}
