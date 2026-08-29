"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export type SeriesOption = { id: string; code: string; name: string };

/**
 * Series-level compatibility checkboxes for an option. Calls the
 * `setOptionCompatibility` server action directly (not via a <form action>,
 * since it takes a plain string array rather than FormData) once the admin
 * hits Save, sending the full desired set — the action diffs it against
 * what's currently stored.
 */
export function CompatEditor({
  optionId,
  series,
  initialSelected,
  action,
  readOnly = false,
}: {
  optionId: string;
  series: SeriesOption[];
  initialSelected: string[];
  action: (optionId: string, seriesCodes: string[]) => Promise<{ error?: string }>;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; success?: boolean }>({});

  function toggle(code: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setResult({});
  }

  function save() {
    startTransition(async () => {
      const res = await action(optionId, Array.from(selected));
      setResult(res.error ? { error: res.error } : { success: true });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {series.map((s) => {
          const active = selected.has(s.code);
          return (
            <label
              key={s.id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-muted-foreground hover:border-brand-accent"
              } ${readOnly ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(s.code)}
                disabled={readOnly}
                className="sr-only"
              />
              {s.code}
            </label>
          );
        })}
      </div>

      {result.error ? (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      ) : result.success ? (
        <p role="status" className="text-sm text-brand-dark">
          Compatibility saved.
        </p>
      ) : null}

      {!readOnly && (
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-10 w-fit bg-brand text-white hover:bg-brand/90"
        >
          {pending ? "Saving…" : "Save compatibility"}
        </Button>
      )}
    </div>
  );
}
