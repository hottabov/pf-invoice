"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { updateContentBlock } from "@/lib/actions/content";
import { ContentBlockForm } from "./content-block-form";
import { RegionPane } from "./region-pane";

export type ContentBlockEditorRegion = { id: string; code: string; name: string };
export type ContentBlockEditorOverride = { regionCode: string; title: string | null; body: string; sortOrder: number };

/**
 * Region-tabbed editor for one content block: a "Default" tab (the
 * regionId:null row every quote falls back to) plus one tab per active
 * region. A region tab with an override shows a dot on its chip so admins
 * can see at a glance which regions have been customized without opening
 * each one.
 */
export function ContentBlockEditor({
  blockKey,
  defaultBlock,
  overrides,
  activeRegions,
  placeholders,
}: {
  blockKey: string;
  defaultBlock: { title: string | null; body: string; sortOrder: number };
  overrides: ContentBlockEditorOverride[];
  activeRegions: ContentBlockEditorRegion[];
  placeholders: Record<string, string>;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null); // null = Default tab
  const overrideByCode = new Map(overrides.map((o) => [o.regionCode, o]));
  const selectedRegion = activeTab ? activeRegions.find((r) => r.code === activeTab) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Region"
        className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        <TabChip label="Default" active={activeTab === null} onClick={() => setActiveTab(null)} />
        {activeRegions.map((region) => (
          <TabChip
            key={region.code}
            label={region.code}
            active={activeTab === region.code}
            onClick={() => setActiveTab(region.code)}
            customized={overrideByCode.has(region.code)}
          />
        ))}
      </div>

      {activeTab === null ? (
        <ContentBlockForm
          action={updateContentBlock.bind(null, blockKey, null)}
          idPrefix="content-default"
          defaultValues={{
            title: defaultBlock.title ?? "",
            body: defaultBlock.body,
            sortOrder: defaultBlock.sortOrder,
          }}
          placeholders={placeholders}
        />
      ) : selectedRegion ? (
        <RegionPane
          blockKey={blockKey}
          regionCode={selectedRegion.code}
          regionName={selectedRegion.name}
          override={overrideByCode.get(selectedRegion.code) ?? null}
          placeholders={placeholders}
        />
      ) : null}
    </div>
  );
}

function TabChip({
  label,
  active,
  onClick,
  customized,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  customized?: boolean;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-brand text-white" : "text-slate-500 hover:text-brand-dark"
      )}
    >
      {label}
      {customized ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-white" : "bg-brand")}
          aria-hidden="true"
          title="Has a region override"
        />
      ) : null}
    </button>
  );
}
