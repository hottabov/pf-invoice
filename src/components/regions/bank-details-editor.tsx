"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

const MAX_ROWS = 12;

type BankDetailsRow = { id: string; label: string; value: string };

let rowCounter = 0;
function nextRowId(): string {
  rowCounter += 1;
  return `bank-row-${rowCounter}`;
}

function rowsFromRecord(record: Record<string, string> | null): BankDetailsRow[] {
  if (!record) return [];
  return Object.entries(record).map(([label, value]) => ({ id: nextRowId(), label, value }));
}

/**
 * Dynamic label/value row editor for `Region.bankDetails`, serialized on
 * every change into a single hidden `<input name={name}>` holding a JSON
 * object — the exact shape `bankDetailsSchema`
 * (src/lib/validation/regions.ts) parses back out server-side. Rows start
 * from the region's existing bankDetails (preserving its current keys) and
 * are tracked by a synthetic row id rather than the label itself, so
 * renaming a label mid-edit never collides with another row until submit,
 * when blank labels are dropped and the rest collapse into one object (a
 * later duplicate label wins, matching plain JS object semantics). Capped at
 * 12 rows, matching the schema's limit — "Add row" simply disappears past
 * that.
 */
export function BankDetailsEditor({
  name,
  defaultValue,
  disabled = false,
}: {
  name: string;
  defaultValue: Record<string, string> | null;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<BankDetailsRow[]>(() => rowsFromRecord(defaultValue));

  const serialized = JSON.stringify(
    Object.fromEntries(
      rows.map((row) => [row.label.trim(), row.value.trim()] as const).filter(([label]) => label.length > 0)
    )
  );

  function updateRow(id: string, patch: Partial<Pick<BankDetailsRow, "label" | "value">>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, { id: nextRowId(), label: "", value: "" }]));
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={serialized} />

      {rows.length === 0 ? <p className="text-sm text-slate-500">No bank details yet.</p> : null}

      {rows.map((row) => (
        <div key={row.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            aria-label="Bank detail label"
            placeholder="Label (e.g. BSB)"
            value={row.label}
            onChange={(e) => updateRow(row.id, { label: e.target.value })}
            maxLength={40}
            disabled={disabled}
            className={cn(fieldInputClass, "sm:w-48")}
          />
          <input
            aria-label="Bank detail value"
            placeholder="Value"
            value={row.value}
            onChange={(e) => updateRow(row.id, { value: e.target.value })}
            maxLength={120}
            disabled={disabled}
            className={cn(fieldInputClass, "flex-1")}
          />
          {disabled ? null : (
            <Button
              type="button"
              variant="outline"
              onClick={() => removeRow(row.id)}
              className="h-11 shrink-0 sm:w-11"
              aria-label="Remove row"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      ))}

      {!disabled && rows.length < MAX_ROWS ? (
        <Button type="button" variant="outline" onClick={addRow} className="h-11 w-full sm:w-auto sm:self-start">
          <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
          Add row
        </Button>
      ) : null}
    </div>
  );
}
