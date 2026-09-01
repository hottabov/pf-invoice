"use client";

import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInputClass } from "@/components/ui-kit";
import { createIndustry, renameIndustry, setCompanyIndustry } from "@/lib/actions/industries";
import { normalizeIndustryName } from "@/lib/validation/industries";

export type IndustryOption = { id: string; name: string };

type Props = {
  /** Matches the `htmlFor` of the `<FieldRow>` this is mounted in. */
  id?: string;
  companyId: string;
  industries: IndustryOption[];
  selectedId: string | null;
  /** Companies using the currently selected industry, for the rename confirm. */
  usageCount: number;
  /**
   * Whether to offer the rename pencil. Renaming is admin-only (see
   * `renameIndustry`): the row is shared, so the edit lands on every
   * manager's companies. Creating and selecting stay open to everyone.
   */
  canRename: boolean;
};

/**
 * Typeahead over the global industry list: filters as you type, offers
 * "Create '...'" for a non-matching query, and (admin-only) a rename pencil
 * next to the current selection. Writes through its own server actions
 * (`setCompanyIndustry`, `createIndustry`, `renameIndustry`) rather than the
 * surrounding `CompanyForm`'s submit, so it only works on a company that
 * already exists — see the `industryPicker` prop on `CompanyForm`, which is
 * `undefined` on the "new client" screen.
 *
 * Every mutation calls `revalidatePath`, and this is called directly (not
 * bound to a `<form>`), so a successful `choose`/`create`/`rename` refreshes
 * the server-rendered `industries`/`selectedId`/`usageCount` props the same
 * way any other server action refresh does in this app (see
 * contacts-section.tsx) — no local mirroring of the selection is needed.
 */
export function IndustryPicker({ id = "company-industry", companyId, industries, selectedId, usageCount, canRename }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = industries.find((i) => i.id === selectedId) ?? null;

  const matches = useMemo(() => {
    const key = normalizeIndustryName(query);
    if (!key) return industries;
    return industries.filter((i) => normalizeIndustryName(i.name).includes(key));
  }, [industries, query]);

  const exactMatch = matches.some((i) => normalizeIndustryName(i.name) === normalizeIndustryName(query));
  const canCreate = query.trim().length > 0 && !exactMatch;

  async function choose(industryId: string | null) {
    setPending(true);
    setError(null);
    const result = await setCompanyIndustry(companyId, industryId);
    setPending(false);
    if (result.error) setError(result.error);
    else {
      setOpen(false);
      setQuery("");
    }
  }

  async function create() {
    setPending(true);
    setError(null);
    const result = await createIndustry(query);
    setPending(false);
    if (result.error) setError(result.error);
    else if (result.id) await choose(result.id);
  }

  async function rename() {
    if (!selected) return;
    const next = window.prompt(
      `Rename "${selected.name}"? Used by ${usageCount} ${usageCount === 1 ? "company" : "companies"}.`,
      selected.name,
    );
    if (next === null || next === selected.name) return;
    setPending(true);
    setError(null);
    const result = await renameIndustry(selected.id, next);
    setPending(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={open ? query : (selected?.name ?? "")}
          placeholder="Search or add an industry"
          disabled={pending}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          // Mounted inside CompanyForm's <form> (see company-form.tsx) — this
          // has no `name` and isn't meant to submit that form, so swallow
          // Enter rather than let the browser trigger the surrounding
          // "Save changes" submit while the user is just typing a search.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          autoComplete="off"
          className={fieldInputClass}
        />
        {selected && !open && canRename && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={rename}
            disabled={pending}
            aria-label="Rename industry"
            className="focus-ring size-11 shrink-0 text-slate-400 hover:bg-slate-100 hover:text-brand-dark"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      {open && (
        <ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-md">
          {selected && (
            <li>
              <button
                type="button"
                onClick={() => choose(null)}
                disabled={pending}
                className="focus-ring flex min-h-11 w-full items-center px-3 text-left text-sm text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Clear
              </button>
            </li>
          )}
          {matches.map((industry) => (
            <li key={industry.id}>
              <button
                type="button"
                onClick={() => choose(industry.id)}
                disabled={pending}
                className="focus-ring flex min-h-11 w-full items-center px-3 text-left text-sm text-brand-dark hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {industry.name}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                onClick={create}
                disabled={pending}
                className="focus-ring flex min-h-11 w-full items-center px-3 text-left text-sm font-medium text-brand hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Create &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
