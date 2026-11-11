"use client";

import { BUSINESS_CATEGORIES, createBusinessSchema } from "@booking/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { errorMessage } from "@/lib/api";
import { applyServerErrors } from "@/lib/forms";
import { CATEGORY_LABELS } from "@/lib/format";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { Field, Input, Select, Textarea } from "../ui/form";

export type BusinessFormValues = z.output<typeof createBusinessSchema>;

const TIMEZONES = Intl.supportedValuesOf("timeZone");

/**
 * The browser's own zone if it's in the list. Browsers set to plain "UTC" report a name the
 * list (region-based names only) doesn't contain, which would leave the field blank.
 */
function defaultTimezone(): string {
  const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.includes(own) ? own : "Europe/London";
}

/** Create and edit use the same fields and the API's own validation rules. */
export function BusinessForm({
  defaults,
  submitLabel,
  onSubmit,
}: {
  defaults?: Partial<BusinessFormValues>;
  submitLabel: string;
  onSubmit: (values: BusinessFormValues) => Promise<unknown>;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: {
      category: "BARBER",
      timezone: defaultTimezone(),
      minNoticeMinutes: 120,
      maxDaysAhead: 60,
      cancelCutoffHours: 24,
      ...defaults,
      description: defaults?.description ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // An empty description means "none", not an empty string.
      await onSubmit({ ...values, description: values.description || undefined });
    } catch (err) {
      if (!applyServerErrors(err, setError)) {
        setFormError(errorMessage(err));
      }
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Business name" error={errors.name?.message}>
        {(control) => <Input {...control} {...register("name")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message}>
          {(control) => (
            <Select {...control} {...register("category")}>
              {BUSINESS_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Time zone"
          hint="Working hours and bookings are in this time zone."
          error={errors.timezone?.message}
        >
          {(control) => (
            <Select {...control} {...register("timezone")}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Address" error={errors.address?.message}>
        {(control) => <Input {...control} autoComplete="street-address" {...register("address")} />}
      </Field>
      <Field label="Description (optional)" error={errors.description?.message}>
        {(control) => <Textarea {...control} rows={3} {...register("description")} />}
      </Field>
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Booking rules</legend>
        <Field
          label="Minimum notice (minutes)"
          hint="How soon a booking may start."
          error={errors.minNoticeMinutes?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              {...register("minNoticeMinutes", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field label="Book up to (days ahead)" error={errors.maxDaysAhead?.message}>
          {(control) => (
            <Input
              {...control}
              type="number"
              min={1}
              {...register("maxDaysAhead", { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field
          label="Free cancellation until (hours before)"
          error={errors.cancelCutoffHours?.message}
        >
          {(control) => (
            <Input
              {...control}
              type="number"
              min={0}
              {...register("cancelCutoffHours", { valueAsNumber: true })}
            />
          )}
        </Field>
      </fieldset>
      <Button type="submit" pending={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
