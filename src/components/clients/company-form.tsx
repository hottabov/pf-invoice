"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/clients";

export type CompanyFormValues = {
  name: string;
  street: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  website: string;
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
 * state (mirrors src/components/catalog/option-form.tsx). Laid out as the
 * two-column desktop grid the design direction calls for: name pairs with
 * website, region with tax ID, then the full address block, then a
 * full-width notes field.
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
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldRow label="Company name" htmlFor="company-name" required>
          <input
            id="company-name"
            name="name"
            defaultValue={defaultValues.name}
            required
            minLength={2}
            maxLength={200}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Website" htmlFor="company-website">
          <input
            id="company-website"
            name="website"
            type="text"
            defaultValue={defaultValues.website}
            placeholder="https://example.com"
            maxLength={200}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow
          label="Region"
          htmlFor="company-region"
          hint="Sets the company's currency and tax rules."
          required
        >
          <select
            id="company-region"
            name="regionCode"
            defaultValue={defaultValues.regionCode}
            autoComplete="off"
            required
            className={fieldInputClass}
          >
            {regions.length === 0 && <option value="">No regions configured</option>}
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Tax ID" htmlFor="company-tax-id" hint="ABN, EIN, VAT number, etc.">
          <input
            id="company-tax-id"
            name="taxId"
            defaultValue={defaultValues.taxId}
            maxLength={50}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Street" htmlFor="company-street">
          <input
            id="company-street"
            name="street"
            defaultValue={defaultValues.street}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="City" htmlFor="company-city">
          <input
            id="company-city"
            name="city"
            defaultValue={defaultValues.city}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="State" htmlFor="company-state">
          <input
            id="company-state"
            name="state"
            defaultValue={defaultValues.state}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Postcode" htmlFor="company-postcode">
          <input
            id="company-postcode"
            name="postcode"
            defaultValue={defaultValues.postcode}
            maxLength={20}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Country" htmlFor="company-country" className="lg:col-span-2">
          <input
            id="company-country"
            name="country"
            defaultValue={defaultValues.country}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Notes" htmlFor="company-notes" className="lg:col-span-2">
          <textarea
            id="company-notes"
            name="notes"
            defaultValue={defaultValues.notes}
            maxLength={2000}
            rows={3}
            className={cn(fieldInputClass, "h-auto min-h-24 py-2")}
          />
        </FieldRow>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
