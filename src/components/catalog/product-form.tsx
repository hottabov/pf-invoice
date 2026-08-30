"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/catalog";

export type ProductFormValues = {
  code: string;
  name: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

const initialState: ActionResult = {};

/**
 * The product create/edit form. On success the bound server action
 * redirects away (create → the new editor, update → the possibly-renamed
 * editor URL), so this only ever needs to render an error state. Laid out
 * as the two-column desktop grid the design direction calls for (mirrors
 * src/components/clients/company-form.tsx): code pairs with name,
 * description spans both columns, then active pairs with sort order.
 */
export function ProductForm({
  action,
  defaultValues,
  submitLabel,
  readOnly = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: ProductFormValues;
  submitLabel: string;
  /** MANAGER view: render every field disabled and hide the submit button. */
  readOnly?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FieldRow label="Code" htmlFor="product-code" required>
          <input
            id="product-code"
            name="code"
            defaultValue={defaultValues.code}
            required
            disabled={readOnly}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Name" htmlFor="product-name" required>
          <input
            id="product-name"
            name="name"
            defaultValue={defaultValues.name}
            required
            minLength={2}
            maxLength={200}
            disabled={readOnly}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Description" htmlFor="product-description" className="lg:col-span-2">
          <textarea
            id="product-description"
            name="description"
            defaultValue={defaultValues.description}
            maxLength={2000}
            rows={4}
            disabled={readOnly}
            className={cn(fieldInputClass, "h-auto min-h-24 py-2")}
          />
        </FieldRow>

        <label className="flex h-11 items-center gap-2 text-sm font-medium text-brand-dark">
          <input
            name="active"
            type="checkbox"
            defaultChecked={defaultValues.active}
            disabled={readOnly}
            className="size-4 rounded border-slate-300 accent-brand disabled:cursor-not-allowed"
          />
          Active
        </label>

        <FieldRow label="Sort order" htmlFor="product-sort-order" hint="Lower numbers list first.">
          <input
            id="product-sort-order"
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={defaultValues.sortOrder}
            disabled={readOnly}
            className={fieldInputClass}
          />
        </FieldRow>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {!readOnly && (
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
      )}
    </form>
  );
}
