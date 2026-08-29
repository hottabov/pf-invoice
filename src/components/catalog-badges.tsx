import { formatMoney } from "@/lib/format";
import type { CatalogPrice } from "@/lib/queries/catalog";

/**
 * Renders a formatted price, or an amber "price required" badge when the
 * item has no price row for the region or the price is flagged for review.
 */
export function PriceDisplay({ price }: { price?: CatalogPrice }) {
  if (!price || price.needsReview) {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
        price required
      </span>
    );
  }

  return (
    <span className="text-sm font-medium text-brand-dark">
      {formatMoney(price.amount, price.currency)}
    </span>
  );
}

export function InactiveBadge() {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      inactive
    </span>
  );
}

export function CompatBadges({ seriesCodes }: { seriesCodes: string[] }) {
  if (seriesCodes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {seriesCodes.map((code) => (
        <span
          key={code}
          className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {code}
        </span>
      ))}
    </div>
  );
}
