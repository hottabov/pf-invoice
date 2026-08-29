import { FileText, Receipt } from "lucide-react";
import type { DocumentStatus, DocumentType } from "@prisma/client";
import { formatMoney } from "@/lib/format";
import { DeleteButton } from "@/components/catalog/delete-button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";

/**
 * Sticky bottom bar for the builder: the document's type/status badge, a
 * live subtotal/tax/total breakdown (recalculated server-side by every
 * mutating action — see recalcDocument in src/lib/actions/documents.ts),
 * and — for a DRAFT — the delete-draft control. Stays visible while
 * scrolling the item list on a phone, which is the primary device this
 * builder targets.
 */
export function StickyFooter({
  type,
  status,
  taxName,
  taxRate,
  subtotal,
  taxAmount,
  total,
  currency,
  deleteAction,
}: {
  type: DocumentType;
  status: DocumentStatus;
  taxName: string;
  taxRate: string;
  subtotal: string;
  taxAmount: string;
  total: string;
  currency: string;
  deleteAction?: () => Promise<ActionResult>;
}) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-6 border-t border-border bg-white px-4 py-3 shadow-sm sm:mx-0 sm:rounded-xl sm:border sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
            status === "DRAFT"
              ? "border-amber-300 text-amber-600"
              : "border-emerald-300 bg-emerald-50 text-emerald-700"
          )}
        >
          {type === "QUOTE" ? <FileText className="size-3.5" /> : <Receipt className="size-3.5" />}
          {status === "DRAFT" ? "Draft" : "Final"}
        </span>
        {deleteAction ? (
          <DeleteButton
            action={deleteAction}
            confirmMessage="Delete this draft? This can't be undone."
            label="Delete draft"
          />
        ) : null}
      </div>

      <dl className="mt-2 flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-foreground">{formatMoney(subtotal, currency)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {taxName} ({taxRate}%)
          </dt>
          <dd className="text-foreground">{formatMoney(taxAmount, currency)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold text-brand-dark">
          <dt>Total</dt>
          <dd>{formatMoney(total, currency)}</dd>
        </div>
      </dl>
    </div>
  );
}
