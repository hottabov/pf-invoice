"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { BankDetailsEditor } from "./bank-details-editor";
import type { ActionResult } from "@/lib/actions/regions";

export type RegionFormValues = {
  code: string;
  name: string;
  currency: string;
  taxName: string;
  taxRate: string;
  entityName: string;
  entityLegalId: string;
  entityAddress: string;
  footerText: string;
  bankDetails: Record<string, string> | null;
  active: boolean;
};

const initialState: ActionResult = {};

/**
 * Shared create/edit form for /settings/regions. On create, `createRegion`
 * redirects to the new region's editor on success (mirrors
 * `UserForm`/`ProductForm`); on edit, `updateRegion` never navigates away and
 * just returns `{}` (mirrors `EditUserForm`) — either way `useActionState`
 * only ever needs to render the error path.
 *
 * `code` is only ever editable at create time — `codeEditable={false}`
 * renders it disabled (and `updateRegionSchema` has no `code` field at all,
 * so even a tampered submission couldn't change it server-side).
 */
export function RegionForm({
  action,
  defaultValues,
  submitLabel,
  codeEditable,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: RegionFormValues;
  submitLabel: string;
  codeEditable: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldRow
          label="Code"
          htmlFor="region-code"
          required
          hint={codeEditable ? "2-3 letters (AU, US, UK...). Can't be changed later." : "Can't be changed after creation."}
        >
          <input
            id="region-code"
            name="code"
            defaultValue={defaultValues.code}
            required={codeEditable}
            disabled={!codeEditable}
            maxLength={3}
            className={cn(fieldInputClass, "uppercase")}
          />
        </FieldRow>

        <FieldRow label="Name" htmlFor="region-name" required>
          <input
            id="region-name"
            name="name"
            defaultValue={defaultValues.name}
            required
            minLength={2}
            maxLength={200}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Currency" htmlFor="region-currency" required hint="3 letters (AUD, USD, GBP...).">
          <input
            id="region-currency"
            name="currency"
            defaultValue={defaultValues.currency}
            required
            maxLength={3}
            className={cn(fieldInputClass, "uppercase")}
          />
        </FieldRow>

        <div className="grid grid-cols-2 gap-4">
          <FieldRow label="Tax name" htmlFor="region-tax-name" required hint="e.g. GST, Sales Tax, VAT.">
            <input
              id="region-tax-name"
              name="taxName"
              defaultValue={defaultValues.taxName}
              required
              maxLength={40}
              className={fieldInputClass}
            />
          </FieldRow>

          <FieldRow label="Tax rate (%)" htmlFor="region-tax-rate" required>
            <input
              id="region-tax-rate"
              name="taxRate"
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              defaultValue={defaultValues.taxRate}
              required
              className={fieldInputClass}
            />
          </FieldRow>
        </div>

        <FieldRow label="Entity name" htmlFor="region-entity-name" required className="lg:col-span-2">
          <input
            id="region-entity-name"
            name="entityName"
            defaultValue={defaultValues.entityName}
            required
            maxLength={200}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Entity legal ID" htmlFor="region-entity-legal-id" hint="e.g. ABN, EIN.">
          <input
            id="region-entity-legal-id"
            name="entityLegalId"
            defaultValue={defaultValues.entityLegalId}
            maxLength={100}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Entity address" htmlFor="region-entity-address">
          <input
            id="region-entity-address"
            name="entityAddress"
            defaultValue={defaultValues.entityAddress}
            maxLength={400}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow
          label="Footer text"
          htmlFor="region-footer-text"
          className="lg:col-span-2"
          hint="Shown at the bottom of documents issued from this region."
        >
          <textarea
            id="region-footer-text"
            name="footerText"
            defaultValue={defaultValues.footerText}
            maxLength={2000}
            rows={3}
            className={cn(fieldInputClass, "h-auto min-h-20 py-2")}
          />
        </FieldRow>

        <label className="flex h-11 items-center gap-2 text-sm font-medium text-brand-dark">
          <input
            name="active"
            type="checkbox"
            defaultChecked={defaultValues.active}
            className="size-4 rounded border-slate-300 accent-brand disabled:cursor-not-allowed"
          />
          Active
        </label>
      </div>

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="p-0 text-sm font-medium text-brand-dark">Bank details</legend>
        <BankDetailsEditor name="bankDetails" defaultValue={defaultValues.bankDetails} />
        <p className="text-sm text-slate-500">
          Shown on invoices for this region — bank name, account number, SWIFT/BSB, etc.
        </p>
      </fieldset>

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
