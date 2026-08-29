"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/catalog/field";
import type { ActionResult } from "@/lib/actions/clients";

export type CompanyFormValues = {
  name: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  taxId: string;
  notes: string;
  regionCode: string;
};

export type RegionOption = { code: string; name: string };

const initialState: ActionResult = {};

/**
 * The company create/edit form. Same shape for both — on create, the bound
 * server action redirects to the new company's editor; on update it stays
 * put and just revalidates, so this only ever needs to render an error
 * state (mirrors src/components/catalog/option-form.tsx).
 */
export function CompanyForm({
  action,
  defaultValues,
  regions,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: CompanyFormValues;
  regions: RegionOption[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Company name" htmlFor="company-name">
        <input
          id="company-name"
          name="name"
          defaultValue={defaultValues.name}
          required
          minLength={2}
          maxLength={200}
          className={inputClass}
        />
      </Field>

      <Field label="Region" htmlFor="company-region" hint="Sets the company's currency and tax rules.">
        <select
          id="company-region"
          name="regionCode"
          defaultValue={defaultValues.regionCode}
          required
          className={inputClass}
        >
          {regions.length === 0 && <option value="">No regions configured</option>}
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name} ({r.code})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Street" htmlFor="company-street">
          <input
            id="company-street"
            name="street"
            defaultValue={defaultValues.street}
            maxLength={120}
            className={inputClass}
          />
        </Field>

        <Field label="City" htmlFor="company-city">
          <input
            id="company-city"
            name="city"
            defaultValue={defaultValues.city}
            maxLength={120}
            className={inputClass}
          />
        </Field>

        <Field label="State" htmlFor="company-state">
          <input
            id="company-state"
            name="state"
            defaultValue={defaultValues.state}
            maxLength={120}
            className={inputClass}
          />
        </Field>

        <Field label="Postcode" htmlFor="company-postcode">
          <input
            id="company-postcode"
            name="postcode"
            defaultValue={defaultValues.postcode}
            maxLength={20}
            className={inputClass}
          />
        </Field>

        <Field label="Country" htmlFor="company-country">
          <input
            id="company-country"
            name="country"
            defaultValue={defaultValues.country}
            maxLength={120}
            className={inputClass}
          />
        </Field>

        <Field label="Tax ID" htmlFor="company-tax-id" hint="ABN, EIN, VAT number, etc.">
          <input
            id="company-tax-id"
            name="taxId"
            defaultValue={defaultValues.taxId}
            maxLength={50}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="company-notes">
        <textarea
          id="company-notes"
          name="notes"
          defaultValue={defaultValues.notes}
          maxLength={2000}
          rows={3}
          className={textareaClass}
        />
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
