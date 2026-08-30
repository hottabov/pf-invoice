"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass } from "@/components/ui-kit";
import type { ActionResult } from "@/lib/actions/documents";

const initialState: ActionResult = {};

/**
 * The "Extra lines" add form: name, qty, unit price and an optional
 * description, submitted to `addCustomLine`. Resets itself after a
 * successful add (mirrors ContactForm's onDone pattern in
 * components/clients/contact-form.tsx) so it's ready for the next line
 * without the manager clearing fields by hand.
 */
export function AddCustomLineForm({
  documentId,
  addCustomLineAction,
}: {
  documentId: string;
  addCustomLineAction: (documentId: string, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState(
    (_prevState: ActionResult, formData: FormData) => addCustomLineAction(documentId, formData),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <FieldRow label="Name" htmlFor="custom-line-name" required>
          <input
            id="custom-line-name"
            name="name"
            required
            maxLength={200}
            placeholder="e.g. Delivery"
            className={fieldInputClass}
          />
        </FieldRow>
        <FieldRow label="Qty" htmlFor="custom-line-qty" required>
          <input
            id="custom-line-qty"
            name="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            defaultValue={1}
            required
            className={fieldInputClass}
          />
        </FieldRow>
        <FieldRow label="Unit price" htmlFor="custom-line-unit-price" required>
          <input
            id="custom-line-unit-price"
            name="unitPrice"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            required
            className={fieldInputClass}
          />
        </FieldRow>
      </div>

      <FieldRow label="Description (optional)" htmlFor="custom-line-description">
        <input id="custom-line-description" name="description" maxLength={500} className={fieldInputClass} />
      </FieldRow>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={pending} className="h-11 w-fit">
        {pending ? "Adding…" : "Add line"}
      </Button>
    </form>
  );
}
