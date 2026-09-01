"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass, CountrySelect } from "@/components/ui-kit";
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
  deliverySameAsMain: boolean;
  deliveryStreet: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostcode: string;
  deliveryCountry: string;
  deliveryContactName: string;
  deliveryPhone: string;
  deliveryNotes: string;
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
 * full-width notes field, then the delivery address section.
 *
 * The "Same as main address" checkbox (owner: avoid double entry when the
 * client office and manufacturing/delivery site are the same) is paired
 * with a hidden fallback input of the same `name` — a plain unchecked
 * `<input type="checkbox">` simply isn't submitted at all, and
 * `deliverySameAsMainSchema` (src/lib/validation/clients.ts) needs an
 * explicit `"false"` to tell "unchecked" apart from "field never sent".
 * Listing the checkbox *before* the hidden input matters: `FormData.get`
 * returns the first value for a repeated name, and only a checked box is
 * ever included, so checked → the checkbox's `"true"` wins; unchecked →
 * only the hidden `"false"` is present.
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
  const [sameAsMain, setSameAsMain] = useState(defaultValues.deliverySameAsMain);

  return (
    <form action={formAction} className="flex flex-col gap-6">
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
          <CountrySelect id="company-country" name="country" defaultValue={defaultValues.country} />
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

      <div className="flex flex-col gap-4 border-t border-slate-200 pt-6">
        <div>
          <h3 className="text-sm font-semibold text-brand-dark">Delivery address</h3>
          <p className="text-sm text-slate-500">
            Where equipment ships to, when different from the main address above.
          </p>
        </div>

        <label className="flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-brand-dark">
          <input
            type="checkbox"
            name="deliverySameAsMain"
            value="true"
            checked={sameAsMain}
            onChange={(e) => setSameAsMain(e.target.checked)}
            className="size-4 rounded border-slate-300 accent-brand"
          />
          Same as main address
          {/* Hidden fallback so an unchecked box still submits an explicit
              "false" — see the doc comment above. */}
          <input type="hidden" name="deliverySameAsMain" value="false" />
        </label>

        {!sameAsMain ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FieldRow label="Delivery street" htmlFor="company-delivery-street" required>
              <input
                id="company-delivery-street"
                name="deliveryStreet"
                defaultValue={defaultValues.deliveryStreet}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery city" htmlFor="company-delivery-city" required>
              <input
                id="company-delivery-city"
                name="deliveryCity"
                defaultValue={defaultValues.deliveryCity}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery state" htmlFor="company-delivery-state">
              <input
                id="company-delivery-state"
                name="deliveryState"
                defaultValue={defaultValues.deliveryState}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery postcode" htmlFor="company-delivery-postcode" required>
              <input
                id="company-delivery-postcode"
                name="deliveryPostcode"
                defaultValue={defaultValues.deliveryPostcode}
                maxLength={20}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery country" htmlFor="company-delivery-country" required className="lg:col-span-2">
              <CountrySelect
                id="company-delivery-country"
                name="deliveryCountry"
                defaultValue={defaultValues.deliveryCountry}
              />
            </FieldRow>

            <FieldRow
              label="Delivery contact name"
              htmlFor="company-delivery-contact-name"
              hint="Who receives the delivery on site — recommended."
            >
              <input
                id="company-delivery-contact-name"
                name="deliveryContactName"
                defaultValue={defaultValues.deliveryContactName}
                maxLength={160}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow
              label="Delivery phone"
              htmlFor="company-delivery-phone"
              hint="Recommended, e.g. +61 3 9338 3471."
            >
              <input
                id="company-delivery-phone"
                name="deliveryPhone"
                defaultValue={defaultValues.deliveryPhone}
                maxLength={40}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery notes" htmlFor="company-delivery-notes" className="lg:col-span-2">
              <textarea
                id="company-delivery-notes"
                name="deliveryNotes"
                defaultValue={defaultValues.deliveryNotes}
                maxLength={500}
                rows={2}
                className={cn(fieldInputClass, "h-auto min-h-16 py-2")}
              />
            </FieldRow>
          </div>
        ) : null}
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
