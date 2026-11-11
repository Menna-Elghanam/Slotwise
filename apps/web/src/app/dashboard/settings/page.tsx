"use client";

import { BusinessForm } from "@/components/dashboard/business-form";
import { ImageUpload } from "@/components/dashboard/image-upload";
import { useToast } from "@/components/toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { api } from "@/lib/api";
import { useWorkspace } from "@/lib/auth";
import { useRefreshWorkspace } from "@/lib/workspace";

export default function SettingsPage() {
  const { data: workspace } = useWorkspace();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();

  const business = workspace?.business;
  if (!business) {
    return <Alert>Create your business first, on the Overview page.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>
            Your page stays at /b/{business.slug} even if you rename the business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessForm
            key={business.id}
            submitLabel="Save changes"
            defaults={{
              name: business.name,
              description: business.description ?? undefined,
              category: business.category,
              address: business.address,
              timezone: business.timezone,
              minNoticeMinutes: business.minNoticeMinutes,
              maxDaysAhead: business.maxDaysAhead,
              cancelCutoffHours: business.cancelCutoffHours,
            }}
            onSubmit={async (values) => {
              await api.patch(`/businesses/${business.id}`, values);
              await refreshWorkspace();
              toast("Changes saved");
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>JPG, PNG or WebP, up to 5 MB.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <ImageUpload business={business} kind="logo" />
          <ImageUpload business={business} kind="cover" />
        </CardContent>
      </Card>
    </div>
  );
}
