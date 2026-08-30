// Money formatting shared by every catalog/browse/editor view. Prisma's
// Decimal fields (Price.amount) come through as Decimal-like objects (they
// stringify losslessly via toString()) rather than plain numbers, so this
// accepts anything with a numeric string representation.
export type Moneyish = number | string | { toString(): string };

/**
 * Format an amount as currency for display. Whole-number amounts render
 * without decimals (e.g. "A$175,000"); anything with a fractional part
 * keeps exactly 2 decimal places. Accepts a Prisma Decimal (or any
 * Decimal-like object) via its `toString()`.
 */
export function formatMoney(amount: Moneyish, currency: string, locale = "en-AU"): string {
  const value = typeof amount === "number" ? amount : Number(amount.toString());
  const isWhole = Number.isInteger(value);

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(value);
}

/**
 * Formats a date as `DD/MM/YYYY` — the en-AU convention used throughout
 * document-facing dates (issue date, quote validity). Zero-padded by hand
 * rather than via `Intl.DateTimeFormat("en-AU")` so the exact digit order
 * and separator are guaranteed everywhere this renders — including inside
 * Gotenberg's headless Chromium, whose bundled ICU data this app doesn't
 * control — rather than depending on the host's CLDR data.
 */
export function formatDateAU(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Coarse "3 days ago" / "12 Jan 2026" relative display for list rows
 * (dashboard recent-documents, documents list) — not meant for anything
 * that needs precision down to the hour.
 */
export function relativeDate(date: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
