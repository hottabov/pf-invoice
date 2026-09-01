import { FileText } from "lucide-react";
import type { DocumentStatus } from "@prisma/client";
import { formatMoney } from "@/lib/format";
import { StatusBadge, STATUS_TONE } from "@/components/ui-kit";
import { DeleteDraftButton } from "@/components/builder/delete-draft-button";
import type { ActionResult } from "@/lib/actions/documents";

type TotalsProps = {
  taxName: string;
  taxRate: string;
  subtotal: string;
  /** The document-level discount percentage, or `null` when none is set —
   * the discount row below only renders when this is non-null. */
  discountPct: string | null;
  discountAmount: string;
  taxAmount: string;
  total: string;
  currency: string;
};

/**
 * Pure subtotal → total breakdown, shared by the mobile sticky bar
 * (`StickyFooter`, below) and the desktop right-hand summary panel (see
 * `[documentId]/page.tsx`) so the two only ever differ in their
 * surrounding chrome, never in the numbers they show.
 */
export function DocumentTotals({
  taxName,
  taxRate,
  subtotal,
  discountPct,
  discountAmount,
  taxAmount,
  total,
  currency,
}: TotalsProps) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-slate-500">Subtotal</dt>
        <dd className="tabular-nums text-slate-700">{formatMoney(subtotal, currency)}</dd>
      </div>
      {discountPct !== null ? (
        <div className="flex justify-between">
          <dt className="text-slate-500">Discount ({discountPct}%)</dt>
          <dd className="tabular-nums text-slate-700">-{formatMoney(discountAmount, currency)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between">
        <dt className="text-slate-500">
          {taxName} ({taxRate}%)
        </dt>
        <dd className="tabular-nums text-slate-700">{formatMoney(taxAmount, currency)}</dd>
      </div>
      <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-semibold text-brand-dark">
        <dt>Total</dt>
        <dd className="tabular-nums">{formatMoney(total, currency)}</dd>
      </div>
    </dl>
  );
}

/**
 * Sticky bottom bar for the <lg builder layout: the document's status
 * badge, the live totals breakdown (recalculated server-side by every
 * mutating action — see recalcDocument in src/lib/actions/documents.ts),
 * and — for a DRAFT — the delete-draft control. Stays visible while
 * scrolling the item list on a phone, which is the primary device this
 * builder targets; `pb-safe` keeps it clear of the home-indicator on
 * notched devices. Hidden at `lg+`, where the same totals live in the
 * sticky right-hand summary panel instead (see `[documentId]/page.tsx`).
 */
export function StickyFooter({
  status,
  taxName,
  taxRate,
  subtotal,
  discountPct,
  discountAmount,
  taxAmount,
  total,
  currency,
  deleteAction,
}: {
  status: DocumentStatus;
  deleteAction?: () => Promise<ActionResult>;
} & TotalsProps) {
  return (
    <div className="pb-safe sticky bottom-0 -mx-4 border-t border-slate-200 bg-white px-4 py-3 sm:mx-0 sm:rounded-xl sm:border sm:px-6 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge tone={STATUS_TONE[status]} className="gap-1.5">
          <FileText className="size-3.5" aria-hidden="true" />
          {status === "DRAFT" ? "Draft" : "Final"}
        </StatusBadge>
        {deleteAction ? <DeleteDraftButton action={deleteAction} /> : null}
      </div>

      <div className="mt-2">
        <DocumentTotals
          taxName={taxName}
          taxRate={taxRate}
          subtotal={subtotal}
          discountPct={discountPct}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          total={total}
          currency={currency}
        />
      </div>
    </div>
  );
}
