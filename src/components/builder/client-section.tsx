"use client";

import { useMemo, useState, useTransition } from "react";
import { Building2, Search } from "lucide-react";
import { SectionCard, fieldInputClass } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/actions/documents";
import type { ClientPickerCompany } from "@/lib/queries/documents";

/**
 * The builder's "Client" section: a search box over every company `user`
 * can see (preloaded in full server-side — companies are a small list, so a
 * client-side filter is simpler than a per-keystroke server round trip),
 * then a company select and — once a company with contacts is chosen — a
 * contact select. Every change calls `setClientAction` directly (no
 * <form>, same pattern as the "make primary" star in
 * src/components/clients/contacts-section.tsx) so picking a client is a
 * single tap with no separate "save" step. Once a company is selected it
 * collapses to a small summary card with a "Change" action, so the picker
 * itself only reappears when actually switching clients.
 */
export function ClientSection({
  documentId,
  companies,
  initialCompanyId,
  initialContactId,
  setClientAction,
  readOnly = false,
}: {
  documentId: string;
  companies: ClientPickerCompany[];
  initialCompanyId: string | null;
  initialContactId: string | null;
  setClientAction: (
    documentId: string,
    companyId: string,
    contactId: string | null
  ) => Promise<ActionResult>;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [companyId, setCompanyId] = useState(initialCompanyId ?? "");
  const [contactId, setContactId] = useState(initialContactId ?? "");
  const [picking, setPicking] = useState(!initialCompanyId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const filteredCompanies = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(term));
  }, [companies, query]);

  const selectedCompany = companies.find((c) => c.id === companyId) ?? null;

  function runSetClient(nextCompanyId: string, nextContactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await setClientAction(documentId, nextCompanyId, nextContactId || null);
      if (result?.error) setError(result.error);
    });
  }

  function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setContactId("");
    if (nextCompanyId) {
      runSetClient(nextCompanyId, "");
      setPicking(false);
      setQuery("");
    }
  }

  function handleContactChange(nextContactId: string) {
    setContactId(nextContactId);
    if (companyId) runSetClient(companyId, nextContactId);
  }

  return (
    <SectionCard
      title="Client"
      actions={
        !readOnly ? (
          <a
            href="/clients/new"
            target="_blank"
            rel="noreferrer"
            className="focus-ring rounded-md text-xs font-medium text-brand hover:underline"
          >
            + New company
          </a>
        ) : undefined
      }
    >
      {readOnly ? (
        <p className="text-sm text-slate-700">{selectedCompany?.name ?? "No client set"}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedCompany && !picking ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Building2 className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-brand-dark">{selectedCompany.name}</p>
                  <p className="text-xs text-slate-500">
                    {selectedCompany.contacts.length === 0
                      ? "No contacts on file"
                      : `${selectedCompany.contacts.length} contact${selectedCompany.contacts.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPicking(true)}
                disabled={pending}
                className="focus-ring shrink-0 rounded-md text-xs font-medium text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search companies…"
                  aria-label="Search companies"
                  className={cn(fieldInputClass, "pl-9")}
                  disabled={pending}
                />
              </div>

              <select
                aria-label="Company"
                value={companyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className={fieldInputClass}
                disabled={pending}
              >
                <option value="">Select a company…</option>
                {filteredCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedCompany && selectedCompany.contacts.length > 0 && !picking ? (
            <select
              aria-label="Contact"
              value={contactId}
              onChange={(e) => handleContactChange(e.target.value)}
              className={fieldInputClass}
              disabled={pending}
            >
              <option value="">No contact selected</option>
              {selectedCompany.contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ")}
                  {contact.isPrimary ? " (primary)" : ""}
                </option>
              ))}
            </select>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
