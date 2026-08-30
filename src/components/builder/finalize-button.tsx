"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FinalizeResult } from "@/lib/actions/finalize";

const CONFIRM_MESSAGE = "Assigns number, freezes prices and company details. Continue?";

/**
 * Turns a DRAFT into a numbered FINAL document. Finalizing is a one-way
 * trip for a normal user (only an admin can undo it — see
 * UnfinalizeButton), so unlike the lightweight remove-item/delete-draft
 * buttons elsewhere in the builder this gets its own confirm dialog
 * spelling out exactly what happens, and an explicit `router.refresh()` on
 * success: the page's server component needs to re-read
 * `document.status`/`number` to flip the whole builder into its read-only
 * FINAL view (every section below switches `readOnly`), not just have one
 * row's data change underneath it.
 */
export function FinalizeButton({
  documentId,
  finalizeAction,
}: {
  documentId: string;
  finalizeAction: (documentId: string) => Promise<FinalizeResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    setError(null);
    startTransition(async () => {
      const result = await finalizeAction(documentId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setNumber(result.number);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="bg-brand text-white hover:bg-brand/90"
      >
        <CheckCircle2 className="size-4" data-icon="inline-start" />
        {pending ? "Finalizing…" : "Finalize"}
      </Button>
      {number ? <p className="text-xs font-medium text-emerald-700">Finalized as {number}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
