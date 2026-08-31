"use client";

import { useState, useTransition } from "react";
import { FileOutput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * "Create invoice" — copies a QUOTE straight into a new DRAFT INVOICE (see
 * `createInvoiceFromQuote` in src/lib/actions/documents.ts) so sales never
 * has to re-key an approved quote. Rendered on every QUOTE's builder page
 * (DRAFT or FINAL — see `DocumentActions`), styled prominently only once
 * the quote is FINAL. `createInvoiceFromQuote` redirects into the new
 * invoice's builder on success — like `DeleteDraftButton`'s bound action,
 * this never needs to handle a success path itself, only surface an error
 * if the redirect never happens.
 */
export function CreateInvoiceButton({
  action,
  prominent,
}: {
  action: () => Promise<ActionResult>;
  prominent: boolean;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = await confirm({
      title: "Create invoice from this quote?",
      description: "Creates a draft invoice with all items copied.",
      confirmLabel: "Create invoice",
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
        variant={prominent ? "default" : "outline"}
        className={cn("h-11 w-full", prominent && "bg-brand text-white hover:bg-brand/90")}
      >
        <FileOutput className="size-4" data-icon="inline-start" aria-hidden="true" />
        {pending ? "Creating…" : "Create invoice"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
