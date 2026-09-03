import { cn } from "@/lib/utils";

export type StatusTone = "amber" | "green" | "brand" | "brand-outline" | "rose" | "slate" | "violet";

const TONE_CLASSES: Record<StatusTone, string> = {
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  green: "border-emerald-300 bg-emerald-50 text-emerald-800",
  brand: "border-transparent bg-brand text-white",
  "brand-outline": "border-brand text-brand",
  rose: "border-rose-300 bg-rose-50 text-rose-800",
  slate: "border-slate-300 bg-slate-50 text-slate-700",
  violet: "border-violet-300 bg-violet-50 text-violet-800",
};

/**
 * Maps the app's well-known status/role keys to a tone, so every screen
 * renders e.g. DRAFT the same shade of amber without repeating the mapping.
 * Callers with a status this table doesn't know about just pass a tone
 * directly to `<StatusBadge>` instead of going through this map.
 */
export const STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "amber",
  FINAL: "green",
  ADMIN: "brand",
  MANAGER: "brand-outline",
  // Same admin rights as ADMIN (see isAdminRole) but its own tone so a
  // glance at a badge still tells the two apart — the support form (Settings
  // → PathQuote Support) addresses its message to whoever holds this role.
  DEVELOPER: "violet",
  PRICE_REQUIRED: "rose",
  ACTIVE: "green",
  INACTIVE: "slate",
};

type StatusBadgeProps = {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
};

/**
 * Small pill used for document status, roles, and the catalog's
 * "price required" flag. All tone/text pairs keep at least 4.5:1 contrast
 * (checked against their own background, not the page background).
 */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
