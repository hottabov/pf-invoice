"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass, CountrySelect, PhoneField } from "@/components/ui-kit";
import { IndustryPicker, type IndustryOption } from "@/components/clients/industry-picker";
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

/**
 * Bundled props for the `IndustryPicker` field. The picker writes through
 * its own server actions (see industry-picker.tsx), so it needs a real
 * `companyId` to point at — it is only ever passed on the edit screen
 * (src/app/(app)/clients/[companyId]/page.tsx). Left `undefined` on the
 * "new client" screen, where no company exists yet to set an industry on.
 */
export type IndustryPickerProps = {
  companyId: string;
  industries: IndustryOption[];
  selectedId: string | null;
  usageCount: number;
  canRename: boolean;
};

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
  industryPicker,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: CompanyFormValues;
  regions: RegionOption[];
  submitLabel: string;
  /** Omitted on the "new client" screen — see `IndustryPickerProps`. */
  industryPicker?: IndustryPickerProps;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );
  // Controlled throughout. React empties an uncontrolled form as soon as its
  // action returns, error or not, so a single rejected field used to send a
  // manager back to the top of a nineteen-field form -- and the country
  // select went back to "Select a country..." quietly enough to be missed on
  // the way through. State survives that reset; `defaultValue` does not.
  const [values, setValues] = useState<CompanyFormValues>(defaultValues);
  const sameAsMain = values.deliverySameAsMain;

  function set<K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldRow label="Company name" htmlFor="company-name" required>
          <input
            id="company-name"
            name="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
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
            value={values.website}
            onChange={(e) => set("website", e.target.value)}
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
            value={values.regionCode}
            onChange={(e) => set("regionCode", e.target.value)}
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
            value={values.taxId}
            onChange={(e) => set("taxId", e.target.value)}
            maxLength={50}
            className={fieldInputClass}
          />
        </FieldRow>

        {industryPicker && (
          <FieldRow label="Industry" htmlFor="company-industry" className="lg:col-span-2">
            <IndustryPicker
              id="company-industry"
              companyId={industryPicker.companyId}
              industries={industryPicker.industries}
              selectedId={industryPicker.selectedId}
              usageCount={industryPicker.usageCount}
              canRename={industryPicker.canRename}
            />
          </FieldRow>
        )}

        <FieldRow label="Street" htmlFor="company-street">
          <input
            id="company-street"
            name="street"
            value={values.street}
            onChange={(e) => set("street", e.target.value)}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="City" htmlFor="company-city">
          <input
            id="company-city"
            name="city"
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="State" htmlFor="company-state">
          <input
            id="company-state"
            name="state"
            value={values.state}
            onChange={(e) => set("state", e.target.value)}
            maxLength={120}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Postcode" htmlFor="company-postcode">
          <input
            id="company-postcode"
            name="postcode"
            value={values.postcode}
            onChange={(e) => set("postcode", e.target.value)}
            maxLength={20}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Country" htmlFor="company-country" className="lg:col-span-2">
          <CountrySelect
            id="company-country"
            name="country"
            value={values.country}
            onChange={(country) => set("country", country)}
          />
        </FieldRow>

        <FieldRow label="Notes" htmlFor="company-notes" className="lg:col-span-2">
          <textarea
            id="company-notes"
            name="notes"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
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
            onChange={(e) => set("deliverySameAsMain", e.target.checked)}
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
                value={values.deliveryStreet}
            onChange={(e) => set("deliveryStreet", e.target.value)}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery city" htmlFor="company-delivery-city" required>
              <input
                id="company-delivery-city"
                name="deliveryCity"
                value={values.deliveryCity}
            onChange={(e) => set("deliveryCity", e.target.value)}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery state" htmlFor="company-delivery-state">
              <input
                id="company-delivery-state"
                name="deliveryState"
                value={values.deliveryState}
            onChange={(e) => set("deliveryState", e.target.value)}
                maxLength={120}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery postcode" htmlFor="company-delivery-postcode" required>
              <input
                id="company-delivery-postcode"
                name="deliveryPostcode"
                value={values.deliveryPostcode}
            onChange={(e) => set("deliveryPostcode", e.target.value)}
                maxLength={20}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow label="Delivery country" htmlFor="company-delivery-country" required className="lg:col-span-2">
              <CountrySelect
                id="company-delivery-country"
                name="deliveryCountry"
                value={values.deliveryCountry}
                onChange={(country) => set("deliveryCountry", country)}
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
                value={values.deliveryContactName}
            onChange={(e) => set("deliveryContactName", e.target.value)}
                maxLength={160}
                className={fieldInputClass}
              />
            </FieldRow>

            <FieldRow
              label="Delivery phone"
              htmlFor="company-delivery-phone"
              hint="Who to call on arrival — recommended."
            >
              <PhoneField
                id="company-delivery-phone"
                name="deliveryPhone"
                value={values.deliveryPhone}
                onChange={(phone) => set("deliveryPhone", phone)}
                defaultCountry={values.deliveryCountry || values.country || undefined}
              />
            </FieldRow>

            <FieldRow label="Delivery notes" htmlFor="company-delivery-notes" className="lg:col-span-2">
              <textarea
                id="company-delivery-notes"
                name="deliveryNotes"
                value={values.deliveryNotes}
            onChange={(e) => set("deliveryNotes", e.target.value)}
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
