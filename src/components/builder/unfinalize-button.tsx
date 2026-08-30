"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UnfinalizeResult } from "@/lib/actions/finalize";

const CONFIRM_MESSAGE =
  "Unfinalize this document? It goes back to DRAFT and becomes editable again — its number is kept and will be reused if it's finalized again.";

/**
 * ADMIN-only escape hatch for a FINAL document issued in error (see
 * `unfinalizeDocument`'s doc comment for why the number survives the round
 * trip). The builder page only ever renders this for `session.user.role ===
 * "ADMIN"` — this component doesn't re-check that itself, matching every
 * other admin-only control in this codebase (the server action is the real
 * enforcement boundary via `requireAdmin`; a manager who somehow triggered
 * this would just get its `{error: "Forbidden..."}` back).
 */
export function UnfinalizeButton({
  documentId,
  unfinalizeAction,
}: {
  documentId: string;
  unfinalizeAction: (documentId: string) => Promise<UnfinalizeResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    setError(null);
    startTransition(async () => {
      const result = await unfinalizeAction(documentId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="outline" onClick={handleClick} disabled={pending}>
        <RotateCcw className="size-4" data-icon="inline-start" />
        {pending ? "Unfinalizing…" : "Unfinalize"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
