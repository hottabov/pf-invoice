"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/catalog/field";
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
 * editor URL), so this only ever needs to render an error state.
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
      <Field label="Code" htmlFor="product-code">
        <input
          id="product-code"
          name="code"
          defaultValue={defaultValues.code}
          required
          disabled={readOnly}
          className={inputClass}
        />
      </Field>

      <Field label="Name" htmlFor="product-name">
        <input
          id="product-name"
          name="name"
          defaultValue={defaultValues.name}
          required
          minLength={2}
          maxLength={200}
          disabled={readOnly}
          className={inputClass}
        />
      </Field>

      <Field label="Description" htmlFor="product-description">
        <textarea
          id="product-description"
          name="description"
          defaultValue={defaultValues.description}
          maxLength={2000}
          rows={4}
          disabled={readOnly}
          className={textareaClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-medium text-brand-dark">
        <input
          name="active"
          type="checkbox"
          defaultChecked={defaultValues.active}
          disabled={readOnly}
          className="size-4 rounded border-border accent-brand disabled:cursor-not-allowed"
        />
        Active
      </label>

      <Field label="Sort order" htmlFor="product-sort-order" hint="Lower numbers list first.">
        <input
          id="product-sort-order"
          name="sortOrder"
          type="number"
          min={0}
          step={1}
          defaultValue={defaultValues.sortOrder}
          disabled={readOnly}
          className={inputClass}
        />
      </Field>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {!readOnly && (
        <Button
          type="submit"
          disabled={pending}
          className="h-10 w-full bg-brand text-white hover:bg-brand/90 sm:w-auto sm:self-start"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
      )}
    </form>
  );
}
