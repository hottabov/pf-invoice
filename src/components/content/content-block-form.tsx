"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FieldRow, fieldInputClass, useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/content";

const PLACEHOLDER_TOKEN_REGEX = /\{\{(\w+)\}\}/g;

/** Every distinct `{{token}}` name found in `body`, in first-seen order. */
function extractPlaceholderTokens(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(PLACEHOLDER_TOKEN_REGEX)) {
    seen.add(match[1]);
  }
  return Array.from(seen);
}

export type ContentBlockFormValues = {
  title: string;
  body: string;
  sortOrder: number;
};

/**
 * Title/body/sortOrder form shared by the default block and every region
 * override pane. Doesn't use `useActionState` (unlike the catalog editors)
 * because this save never navigates away — the admin stays on the same
 * tab — so success needs an explicit signal; that's a plain `useTransition`
 * + toast, calling `action` directly from a manual submit handler, the same
 * pattern `CompatEditor` uses in src/components/catalog/compat-editor.tsx.
 *
 * The body textarea is a controlled input purely so the placeholder hint
 * panel can update live as the admin types, without needing a save
 * round-trip.
 */
export function ContentBlockForm({
  action,
  idPrefix,
  defaultValues,
  placeholders,
  submitLabel = "Save changes",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  idPrefix: string;
  defaultValues: ContentBlockFormValues;
  placeholders: Record<string, string>;
  submitLabel?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState(defaultValues.body);
  const toast = useToast();

  const presentPlaceholders = extractPlaceholderTokens(body).filter((token) => token in placeholders);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 lg:col-span-2">
        <FieldRow label="Title" htmlFor={`${idPrefix}-title`}>
          <input
            id={`${idPrefix}-title`}
            name="title"
            defaultValue={defaultValues.title}
            maxLength={200}
            disabled={pending}
            className={fieldInputClass}
          />
        </FieldRow>

        <FieldRow label="Body (Markdown)" htmlFor={`${idPrefix}-body`} required>
          <textarea
            id={`${idPrefix}-body`}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={20000}
            rows={20}
            disabled={pending}
            className={cn(fieldInputClass, "h-auto min-h-[28rem] py-2 font-mono text-sm")}
          />
        </FieldRow>

        <FieldRow
          label="Sort order"
          htmlFor={`${idPrefix}-sort-order`}
          hint="Lower numbers list first."
          className="max-w-40"
        >
          <input
            id={`${idPrefix}-sort-order`}
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={defaultValues.sortOrder}
            disabled={pending}
            className={fieldInputClass}
          />
        </FieldRow>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
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

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-brand-dark">Placeholders in this body</h3>
        {presentPlaceholders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No placeholders found.</p>
        ) : (
          <dl className="mt-3 flex flex-col gap-3">
            {presentPlaceholders.map((token) => (
              <div key={token}>
                <dt className="font-mono text-xs text-brand-dark">{`{{${token}}}`}</dt>
                <dd className="mt-0.5 text-xs text-slate-500">{placeholders[token]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
