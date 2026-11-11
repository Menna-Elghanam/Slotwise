"use client";

import { useQueries } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { BusinessForm } from "@/components/dashboard/business-form";
import { useToast } from "@/components/toast";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/auth";
import type { OwnedBusiness, WorkingHoursRange } from "@/lib/types";
import { useRefreshWorkspace } from "@/lib/workspace";

function SetupChecklist({ business }: { business: OwnedBusiness }) {
  const activeStaff = business.staff.filter((member) => member.isActive);
  const hours = useQueries({
    queries: activeStaff.map((member) => ({
      queryKey: ["working-hours", member.id],
      queryFn: () => api.get<{ ranges: WorkingHoursRange[] }>(`/staff/${member.id}/working-hours`),
    })),
  });

  // The same rule the API uses to decide whether a business appears in "Browse".
  const steps = [
    { done: business.services.length > 0, label: "Add a service", href: "/dashboard/services" },
    {
      done: activeStaff.some((member) => member.serviceIds.length > 0),
      label: "Add staff (you count) and assign them services",
      href: "/dashboard/team",
    },
    {
      done: hours.some((result) => (result.data?.ranges.length ?? 0) > 0),
      label: "Set working hours",
      href: "/dashboard/hours",
    },
  ];
  const listed = steps.every((step) => step.done);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{listed ? "You're taking bookings" : "Get listed"}</CardTitle>
        <CardDescription>
          {listed
            ? "Customers can find and book you."
            : "Customers can find you once these are done."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              {step.done ? (
                <CheckCircle2 aria-hidden className="size-5 text-success" />
              ) : (
                <Circle aria-hidden className="size-5 text-muted-foreground" />
              )}
              <Link href={step.href} className="hover:underline">
                {step.label}
              </Link>
              <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: workspace } = useWorkspace();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();

  if (!workspace) {
    return null;
  }
  const { business, staffMemberships } = workspace;

  if (!business) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <h1 className="text-2xl font-bold">Take bookings with your own page</h1>
        {staffMemberships.length > 0 && (
          <Alert title={`You work at ${staffMemberships.map((m) => m.business.name).join(", ")}`}>
            <Link href="/dashboard/schedule" className="font-medium text-primary hover:underline">
              See your schedule
            </Link>{" "}
            — or create a business of your own below.
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Create your business</CardTitle>
            <CardDescription>You can change all of this later.</CardDescription>
          </CardHeader>
          <CardContent>
            <BusinessForm
              submitLabel="Create business"
              onSubmit={async (values) => {
                await api.post("/businesses", values);
                await refreshWorkspace();
                toast("Business created");
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{business.name}</h1>
        <ButtonLink href={`/b/${business.slug}`} variant="secondary" size="sm">
          View public page
        </ButtonLink>
      </div>
      <VerifyEmailBanner />
      {business.status === "SUSPENDED" && (
        <Alert tone="error" title="Your business is suspended">
          It's hidden from customers and takes no new bookings. Please contact the platform team.
        </Alert>
      )}
      <SetupChecklist business={business} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Services</p>
            <p className="text-2xl font-semibold">{business.services.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Active staff</p>
            <p className="text-2xl font-semibold">
              {business.staff.filter((member) => member.isActive).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Bookings</p>
            <Link
              href="/dashboard/schedule"
              className="text-lg font-semibold text-primary hover:underline"
            >
              Open schedule →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
