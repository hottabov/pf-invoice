"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass, PhoneField } from "@/components/ui-kit";
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
  defaultCountry,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  defaultValues: ContactFormValues;
  submitLabel: string;
  onDone?: () => void;
  onCancel?: () => void;
  idPrefix: string;
  /** ISO alpha-2 the phone field opens on for a contact with no number yet
   * — the company's own country. See `PhoneField`. */
  defaultCountry?: string;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => action(formData),
    initialState
  );
  // Controlled, every field of it, because React empties an uncontrolled
  // form once its action returns — including when the action returned an
  // error. A manager who mistyped a phone number was made to retype the
  // name, the email and the position as well, none of which the server had
  // any complaint about. State survives that reset; `defaultValue` does not.
  const [values, setValues] = useState<ContactFormValues>(defaultValues);
  const wasPending = useRef(false);

  function set<K extends keyof ContactFormValues>(field: K, value: ContactFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      onDone?.();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldRow label="First name" htmlFor={`${idPrefix}-first-name`} required>
          <input
            id={`${idPrefix}-first-name`}
            name="firstName"
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            maxLength={80}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Last name" htmlFor={`${idPrefix}-last-name`}>
          <input
            id={`${idPrefix}-last-name`}
            name="lastName"
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            maxLength={80}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Email" htmlFor={`${idPrefix}-email`}>
          <input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Phone" htmlFor={`${idPrefix}-phone`}>
          <PhoneField
            id={`${idPrefix}-phone`}
            name="phone"
            value={values.phone}
            onChange={(phone) => set("phone", phone)}
            defaultCountry={defaultCountry}
          />
        </FieldRow>

        <FieldRow label="Position" htmlFor={`${idPrefix}-position`} className="sm:col-span-2">
          <input
            id={`${idPrefix}-position`}
            name="position"
            value={values.position}
            onChange={(e) => set("position", e.target.value)}
            maxLength={80}
            className={fieldInputClass}
          />
        </FieldRow>
      </div>

      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-dark">
        <input
          name="isPrimary"
          type="checkbox"
          checked={values.isPrimary}
          onChange={(e) => set("isPrimary", e.target.checked)}
          className="size-4 rounded border-slate-300 accent-brand"
        />
        Primary contact
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:h-9 sm:w-auto"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
