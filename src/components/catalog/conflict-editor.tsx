"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export type ConflictOptionRow = { id: string; code: string; name: string };

/**
 * Conflict checkboxes for an option — every other option in the catalogue,
 * checked for the ones this one can't be sold alongside (e.g. a knife too
 * long for a machine's cut height; see the `OptionConflict` model comment in
 * schema.prisma). Same shape as `CompatEditor` (series-level compatibility)
 * deliberately: calls the `setOptionConflicts` server action directly with
 * the full desired set of conflicting option ids once the admin hits Save,
 * rather than diffing client-side — the action does that.
 *
 * Because a conflict is symmetric and stored as a single row for the whole
 * pair, checking "VRB-180" here and saving produces the exact same row as
 * checking "MTS" from VRB-180's own editor — `initialSelected` (from
 * `OptionDetail.conflicts`, which reads both sides of the pair) reflects
 * that: this list is never one-sided.
 */
export function ConflictEditor({
  optionId,
  options,
  initialSelected,
  action,
  readOnly = false,
}: {
  optionId: string;
  options: ConflictOptionRow[];
  initialSelected: string[];
  action: (optionId: string, conflictingOptionIds: string[]) => Promise<{ error?: string }>;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function toggle(id: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
  }

  function save() {
    startTransition(async () => {
      const res = await action(optionId, Array.from(selected));
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      toast.success("Conflicts saved");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 ? (
        <p className="text-sm text-slate-500">No other options in the catalogue yet.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          {options.map((o) => {
            const active = selected.has(o.id);
            return (
              <label
                key={o.id}
                htmlFor={`conflict-${o.id}`}
                className={cn(
                  "flex min-h-11 items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 transition-colors",
                  readOnly ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-slate-50"
                )}
              >
                <input
                  id={`conflict-${o.id}`}
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(o.id)}
                  disabled={readOnly}
                  className="size-4 shrink-0 rounded border-slate-300 accent-brand disabled:cursor-not-allowed"
                />
                <span className="font-mono text-xs text-slate-500">{o.code}</span>
                <span className="min-w-0 truncate font-medium text-brand-dark">{o.name}</span>
              </label>
            );
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!readOnly && options.length > 0 && (
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="h-11 w-full bg-brand text-white hover:bg-brand/90 sm:w-fit"
        >
          {pending ? "Saving…" : "Save conflicts"}
        </Button>
      )}
    </div>
  );
}
