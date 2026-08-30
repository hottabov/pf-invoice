"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/catalog";

export type OptionFormValues = {
  code: string;
  name: string;
  shortDescription: string;
  attributeSchema: string;
  active: boolean;
  sortOrder: number;
};

const initialState: ActionResult = {};

/**
 * The option create/edit form. Same fields as ProductForm plus a short
 * description and a raw-JSON attribute schema textarea (validated by
 * optionSchema — must parse to an array or object, or be left empty), set
 * in a monospace face since it holds structured text.
 */
export function OptionForm({
  action,
  defaultValues,
  submitLabel,
  readOnly = false,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: OptionFormValues;
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
        <FieldRow label="Code" htmlFor="option-code" required>
          <input
            id="option-code"
            name="code"
            defaultValue={defaultValues.code}
            required
            disabled={readOnly}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Name" htmlFor="option-name" required>
          <input
            id="option-name"
            name="name"
            defaultValue={defaultValues.name}
            required
            minLength={2}
            maxLength={200}
            disabled={readOnly}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow
          label="Short description"
          htmlFor="option-short-description"
          className="lg:col-span-2"
        >
          <textarea
            id="option-short-description"
            name="shortDescription"
            defaultValue={defaultValues.shortDescription}
            maxLength={500}
            rows={2}
            disabled={readOnly}
            className={cn(fieldInputClass, "h-auto min-h-16 py-2")}
          />
        </FieldRow>

        <FieldRow
          label="Attribute schema (JSON)"
          htmlFor="option-attribute-schema"
          hint='Optional. Must be a JSON array or object, e.g. [{"key":"metres","label":"Travel (m)","type":"number"}]. Leave blank for none.'
          className="lg:col-span-2"
        >
          <textarea
            id="option-attribute-schema"
            name="attributeSchema"
            defaultValue={defaultValues.attributeSchema}
            rows={4}
            disabled={readOnly}
            className={cn(fieldInputClass, "h-auto min-h-24 py-2 font-mono text-xs")}
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

        <FieldRow label="Sort order" htmlFor="option-sort-order" hint="Lower numbers list first.">
          <input
            id="option-sort-order"
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
