"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/catalog/field";
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
 * optionSchema — must parse to an array or object, or be left empty).
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
      <Field label="Code" htmlFor="option-code">
        <input
          id="option-code"
          name="code"
          defaultValue={defaultValues.code}
          required
          disabled={readOnly}
          className={inputClass}
        />
      </Field>

      <Field label="Name" htmlFor="option-name">
        <input
          id="option-name"
          name="name"
          defaultValue={defaultValues.name}
          required
          minLength={2}
          maxLength={200}
          disabled={readOnly}
          className={inputClass}
        />
      </Field>

      <Field label="Short description" htmlFor="option-short-description">
        <textarea
          id="option-short-description"
          name="shortDescription"
          defaultValue={defaultValues.shortDescription}
          maxLength={500}
          rows={2}
          disabled={readOnly}
          className={textareaClass}
        />
      </Field>

      <Field
        label="Attribute schema (JSON)"
        htmlFor="option-attribute-schema"
        hint='Optional. Must be a JSON array or object, e.g. [{"key":"metres","label":"Travel (m)","type":"number"}]. Leave blank for none.'
      >
        <textarea
          id="option-attribute-schema"
          name="attributeSchema"
          defaultValue={defaultValues.attributeSchema}
          rows={4}
          disabled={readOnly}
          className={`${textareaClass} font-mono text-xs`}
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

      <Field label="Sort order" htmlFor="option-sort-order" hint="Lower numbers list first.">
        <input
          id="option-sort-order"
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
