"use client";

import { createStaffInviteSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useToast } from "@/components/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Skeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useWorkspace } from "@/lib/auth";
import { formatInZone } from "@/lib/format";
import type { OwnedBusiness, StaffInvite, TeamMember } from "@/lib/types";
import { useRefreshWorkspace } from "@/lib/workspace";

function MemberRow({ member, business }: { member: TeamMember; business: OwnedBusiness }) {
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();
  const [serviceIds, setServiceIds] = useState(member.serviceIds);
  const dirty =
    serviceIds.length !== member.serviceIds.length ||
    serviceIds.some((id) => !member.serviceIds.includes(id));

  const saveServices = useMutation({
    mutationFn: () => api.put(`/staff/${member.id}/services`, { serviceIds }),
    onSuccess: async () => {
      await refreshWorkspace();
      toast(`Services saved for ${member.name}`);
    },
  });
  const setActive = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/staff/${member.id}`, { isActive }),
    onSuccess: async (_data, isActive) => {
      await refreshWorkspace();
      toast(isActive ? `${member.name} is active again` : `${member.name} deactivated`);
    },
  });
  const upcomingCount =
    setActive.error instanceof ApiError && setActive.error.code === "HAS_UPCOMING_BOOKINGS"
      ? (setActive.error.details as { upcomingBookings?: number } | undefined)?.upcomingBookings
      : undefined;

  return (
    <li className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-medium">
            {member.name}
            {member.isOwner && <Badge tone="accent">Owner</Badge>}
            {!member.isActive && <Badge>Inactive</Badge>}
          </p>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          pending={setActive.isPending}
          onClick={() => setActive.mutate(!member.isActive)}
        >
          {member.isActive ? "Deactivate" : "Activate"}
        </Button>
      </div>

      {setActive.isError && (
        <Alert tone="error">
          {upcomingCount
            ? `${member.name} still has ${upcomingCount} upcoming booking(s). Cancel or move them first (Schedule).`
            : errorMessage(setActive.error)}
        </Alert>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Performs</legend>
        {business.services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add services first.</p>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {business.services.map((service) => (
              <label key={service.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={serviceIds.includes(service.id)}
                  onChange={(e) =>
                    setServiceIds((ids) =>
                      e.target.checked
                        ? [...ids, service.id]
                        : ids.filter((id) => id !== service.id),
                    )
                  }
                />
                {service.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {saveServices.isError && <Alert tone="error">{errorMessage(saveServices.error)}</Alert>}
      {dirty && (
        <Button
          size="sm"
          className="self-start"
          pending={saveServices.isPending}
          onClick={() => saveServices.mutate()}
        >
          Save services
        </Button>
      )}
    </li>
  );
}

function Invites({ business }: { business: OwnedBusiness }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const invitesKey = ["invites", business.id];
  const invites = useQuery({
    queryKey: invitesKey,
    queryFn: () =>
      api
        .get<{ invites: StaffInvite[] }>(`/businesses/${business.id}/staff/invites`)
        .then((r) => r.invites),
  });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(createStaffInviteSchema) });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api.post(`/businesses/${business.id}/staff/invites`, values);
      await queryClient.invalidateQueries({ queryKey: invitesKey });
      toast(`Invite sent to ${values.email}`);
      reset();
    } catch (err) {
      setFormError(errorMessage(err));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite staff</CardTitle>
        <CardDescription>
          They get an email link and join after logging in with that address.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <Field label="Email" error={errors.email?.message} className="flex-1">
            {(control) => <Input {...control} type="email" {...register("email")} />}
          </Field>
          <Button type="submit" pending={isSubmitting} className="sm:mt-7">
            Send invite
          </Button>
        </form>
        {formError && <Alert tone="error">{formError}</Alert>}
        {invites.isPending ? (
          <Skeleton className="h-10" />
        ) : invites.isError ? (
          <Alert tone="error">{errorMessage(invites.error)}</Alert>
        ) : invites.data.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Waiting for</p>
            <ul className="flex flex-col gap-1 text-sm">
              {invites.data.map((invite) => (
                <li key={invite.id} className="flex justify-between gap-2">
                  <span>{invite.email}</span>
                  <span className="text-muted-foreground">
                    expires {formatInZone(invite.expiresAt, business.timezone, "d MMM")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function TeamPage() {
  const { data: workspace } = useWorkspace();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();
  const addSelf = useMutation({
    mutationFn: (businessId: string) => api.post(`/businesses/${businessId}/staff/me`),
    onSuccess: async () => {
      await refreshWorkspace();
      toast("You're now on the team");
    },
  });

  const business = workspace?.business;
  if (!business) {
    return <Alert>Create your business first, on the Overview page.</Alert>;
  }
  const ownerIsStaff = business.staff.some((member) => member.isOwner);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Team</h1>

      {!ownerIsStaff && (
        <Alert title="Do you take bookings yourself?">
          <p>Add yourself to the team to appear in the booking calendar.</p>
          {addSelf.isError && <p className="text-destructive">{errorMessage(addSelf.error)}</p>}
          <Button
            size="sm"
            className="mt-2"
            pending={addSelf.isPending}
            onClick={() => addSelf.mutate(business.id)}
          >
            Add me as staff
          </Button>
        </Alert>
      )}

      {business.staff.length === 0 ? (
        <EmptyState title="No team members yet">Add yourself or invite someone.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {business.staff.map((member) => (
            <MemberRow key={member.id} member={member} business={business} />
          ))}
        </ul>
      )}

      <Invites business={business} />
    </div>
  );
}
