"use client";

import { createServiceSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { api, errorMessage } from "@/lib/api";
import { useWorkspace } from "@/lib/auth";
import { applyServerErrors } from "@/lib/forms";
import { formatDuration, formatMoney } from "@/lib/format";
import type { OwnerService } from "@/lib/types";
import { useRefreshWorkspace } from "@/lib/workspace";

/**
 * Owners type a price like "25.50"; the API stores integer cents. The form converts, and the
 * cents rules (minimum 50) still come from the shared schema.
 */
const serviceFormSchema = createServiceSchema
  .omit({ priceCents: true })
  .extend({ price: z.number({ error: "Enter a price" }).min(0.5, "At least 0.50") });
type ServiceFormValues = z.output<typeof serviceFormSchema>;

function toPayload(values: ServiceFormValues) {
  return {
    name: values.name,
    description: values.description || undefined,
    durationMinutes: values.durationMinutes,
    bufferMinutes: values.bufferMinutes ?? 0,
    priceCents: Math.round(values.price * 100),
  };
}

function ServiceForm({ service, onSaved }: { service?: OwnerService; onSaved: () => void }) {
  const { data: workspace } = useWorkspace();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: service
      ? {
          name: service.name,
          description: service.description ?? "",
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          price: service.priceCents / 100,
        }
      : { durationMinutes: 30, bufferMinutes: 0, description: "" },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (service) {
        await api.patch(`/services/${service.id}`, toPayload(values));
      } else {
        await api.post(`/businesses/${workspace?.business?.id}/services`, toPayload(values));
        reset();
      }
      await refreshWorkspace();
      toast(service ? "Service updated" : "Service added");
      onSaved();
    } catch (err) {
      if (!applyServerErrors(err, setError)) {
        setFormError(errorMessage(err));
      }
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Name" error={errors.name?.message}>
        {(control) => <Input {...control} {...register("name")} />}
      </Field>
      <Field label="Description (optional)" error={errors.description?.message}>
        {(control) => <Textarea {...control} rows={2} {...register("description")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Duration (minutes)" error={errors.durationMinutes?.message}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={5}
              step={5}
              {...register("durationMinutes", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field
          label="Buffer after (minutes)"
          hint="Clean-up time; customers don't see it."
          error={errors.bufferMinutes?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              step={5}
              {...register("bufferMinutes", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field label="Price (EUR)" error={errors.price?.message}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0.5}
              step={0.01}
              inputMode="decimal"
              {...register("price", { valueAsNumber: true })}
            />
          )}
        </Field>
      </div>
      <Button type="submit" pending={isSubmitting} className="self-start">
        {service ? "Save changes" : "Add service"}
      </Button>
    </form>
  );
}

export default function ServicesPage() {
  const { data: workspace } = useWorkspace();
  const refreshWorkspace = useRefreshWorkspace();
  const toast = useToast();
  const [editing, setEditing] = useState<OwnerService | null>(null);
  const [archiving, setArchiving] = useState<OwnerService | null>(null);
  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/services/${id}`),
    onSuccess: async () => {
      await refreshWorkspace();
      toast("Service removed");
      setArchiving(null);
    },
  });

  const business = workspace?.business;
  if (!business) {
    return <Alert>Create your business first, on the Overview page.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Services</h1>

      {business.services.length === 0 ? (
        <EmptyState title="No services yet">Add what customers can book, below.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {business.services.map((service) => (
            <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">{service.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDuration(service.durationMinutes)}
                  {service.bufferMinutes > 0 && ` + ${service.bufferMinutes} min buffer`} ·{" "}
                  {formatMoney(service.priceCents, service.currency)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(service)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setArchiving(service)}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add a service</CardTitle>
        </CardHeader>
        <CardContent>
          <ServiceForm onSaved={() => undefined} />
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit service">
        {editing && (
          <ServiceForm key={editing.id} service={editing} onSaved={() => setEditing(null)} />
        )}
      </Dialog>

      <Dialog
        open={archiving !== null}
        onClose={() => {
          archive.reset();
          setArchiving(null);
        }}
        title={`Remove ${archiving?.name ?? "service"}?`}
        description="Customers can no longer book it. Existing bookings stay as they are."
      >
        {archive.isError && <Alert tone="error">{errorMessage(archive.error)}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setArchiving(null)}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            pending={archive.isPending}
            onClick={() => archiving && archive.mutate(archiving.id)}
          >
            Remove service
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
