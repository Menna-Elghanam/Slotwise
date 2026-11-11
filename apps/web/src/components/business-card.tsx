import { MapPin } from "lucide-react";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/format";
import type { PublicBusiness } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function BusinessLogo({ business, size = 48 }: { business: PublicBusiness; size?: number }) {
  if (business.logoUrl) {
    return (
      // A plain <img>: Cloudinary already serves resized, cached images, so next/image's
      // optimiser (and its remote-domain config) isn't needed.
      <img
        src={business.logoUrl}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-lg bg-accent font-semibold text-accent-foreground"
      style={{ width: size, height: size }}
    >
      {business.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function BusinessCard({ business }: { business: PublicBusiness }) {
  return (
    <Card className="transition-shadow focus-within:shadow-md hover:shadow-md">
      <Link href={`/b/${business.slug}`} className="flex h-full gap-4 p-5">
        <BusinessLogo business={business} />
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-semibold">{business.name}</h3>
          <Badge className="self-start">{CATEGORY_LABELS[business.category]}</Badge>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{business.address}</span>
          </p>
        </div>
      </Link>
    </Card>
  );
}
