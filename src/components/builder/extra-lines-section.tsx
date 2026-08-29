import { formatMoney } from "@/lib/format";
import { toCents, fromCents } from "@/lib/pricing";
import { RemoveItemButton } from "@/components/builder/remove-item-button";
import { AddCustomLineForm } from "@/components/builder/add-custom-line-form";
import type { ActionResult } from "@/lib/actions/documents";
import type { BuilderLine } from "@/lib/queries/documents";

/**
 * The builder's "Extra lines" section: every document-level CUSTOM line
 * (delivery, install, etc. — never an item's OPTION lines, which live on
 * the item card instead), each with its qty × unit price and line total,
 * plus the add-line form. `RemoveItemButton` is reused as-is here: it's
 * already a generic "call this action, show its error" control with no
 * item-specific logic.
 */
export function ExtraLinesSection({
  documentId,
  lines,
  currency,
  addCustomLineAction,
  removeLineAction,
  readOnly = false,
}: {
  documentId: string;
  lines: BuilderLine[];
  currency: string;
  addCustomLineAction: (documentId: string, formData: FormData) => Promise<ActionResult>;
  removeLineAction: (lineId: string) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-brand-dark">Extra lines</h2>

      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No extra lines yet.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-brand-dark">{line.name}</span>
                {line.description ? (
                  <span className="text-xs text-muted-foreground">{line.description}</span>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {line.qty} × {formatMoney(line.unitPrice, currency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-brand-dark">
                  {formatMoney(fromCents(line.qty * toCents(line.unitPrice)), currency)}
                </span>
                {!readOnly && (
                  <RemoveItemButton
                    action={removeLineAction.bind(null, line.id)}
                    label={`Remove ${line.name}`}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <div className="mt-4">
          <AddCustomLineForm documentId={documentId} addCustomLineAction={addCustomLineAction} />
        </div>
      )}
    </section>
  );
}
