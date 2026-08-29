"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/catalog/field";
import type { ActionResult } from "@/lib/actions/clients";

export type ContactFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  position: string;
  isPrimary: boolean;
};

const initialState: ActionResult = {};

/**
 * Shared add/edit form for a company's contacts. Used both for the
 * always-visible "add contact" form and for a single contact's inline edit
 * mode. `onDone` fires once after a submission completes without error —
 * the parent uses it to close the inline editor / reset the add form,
 * since a successful action only revalidates data (no redirect to key off
 * of), and the parent otherwise has no signal that the submit finished.
 */
export function ContactForm({
  action,
  defaultValues,
  submitLabel,
  onDone,
  onCancel,
  idPrefix,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: ContactFormValues;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      onDone?.();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor={`${idPrefix}-first-name`}>
          <input
            id={`${idPrefix}-first-name`}
            name="firstName"
            defaultValue={defaultValues.firstName}
            required
            maxLength={80}
            className={inputClass}
          />
        </Field>

        <Field label="Last name" htmlFor={`${idPrefix}-last-name`}>
          <input
            id={`${idPrefix}-last-name`}
            name="lastName"
            defaultValue={defaultValues.lastName}
            maxLength={80}
            className={inputClass}
          />
        </Field>

        <Field label="Email" htmlFor={`${idPrefix}-email`}>
          <input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            defaultValue={defaultValues.email}
            className={inputClass}
          />
        </Field>

        <Field label="Phone" htmlFor={`${idPrefix}-phone`}>
          <input
            id={`${idPrefix}-phone`}
            name="phone"
            defaultValue={defaultValues.phone}
            maxLength={40}
            className={inputClass}
          />
        </Field>

        <Field label="Position" htmlFor={`${idPrefix}-position`}>
          <input
            id={`${idPrefix}-position`}
            name="position"
            defaultValue={defaultValues.position}
            maxLength={80}
            className={inputClass}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm font-medium text-brand-dark">
        <input
          name="isPrimary"
          type="checkbox"
          defaultChecked={defaultValues.isPrimary}
          className="size-4 rounded border-border accent-brand"
        />
        Primary contact
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={pending}
          className="h-9 bg-brand text-white hover:bg-brand/90"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
