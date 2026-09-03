import { cn } from "@/lib/utils";
import type { DerivativeWidth } from "@/lib/image-derivatives";

/** Height of the thumbnail box, in CSS px — the same for every catalogue
 * thumbnail so rows in a list line up regardless of image aspect ratio. */
const BOX_HEIGHT_PX = 40;

/** Derivative widths requested for the 1× and 2× sources. Both must be
 * members of `DERIVATIVE_WIDTHS`, or `/api/files` ignores `?w=` and falls
 * back to serving the print-resolution original — the exact thing this
 * component exists to avoid. The type annotation is what enforces that. */
const SRC_WIDTH_1X: DerivativeWidth = 64;
const SRC_WIDTH_2X: DerivativeWidth = 128;

type CatalogThumbProps = {
  /** `Product.imageUrl` / `Option.imageUrl` — an `/api/files/<name>` URL, or
   * `null` when the catalogue entry has no image. */
  src: string | null;
  /** Box width in CSS px. Defaults to a square box, which suits the roughly
   * square option icons; product photos are landscape and pass a wider one
   * so they don't shrink to a sliver inside a square. */
  width?: number;
  className?: string;
};

/**
 * The small catalogue image shown beside a product/option row or card.
 *
 * An entry with no image still reserves the box, as an *unstyled* spacer:
 * catalogues are mixed (most options carry an icon, a handful don't), and
 * without it the names in a list would jump left and right row to row. A
 * bordered empty placeholder would read as a broken image, so the spacer
 * draws nothing at all. Always decorative either way: the row already names
 * the entry in text right beside it, so the image carries no information a
 * screen reader would otherwise miss (`alt=""`, hidden).
 *
 * Raster sources are requested through the `/api/files` route's `?w=`
 * thumbnail parameter (src/lib/image-derivatives.ts) at 1×/2× the box, which
 * is the whole point of this component: the stored original is a
 * print-resolution photo (a ~1MB 1280px PNG for a product), and it stays
 * that way because the quotation sheet/PDF renders it — but a list page must
 * not ship dozens of them. SVG has no derivative — it is vector and already
 * a few KB — so it is linked as-is.
 *
 * Deliberately a plain `<img>` rather than `next/image`: these URLs are
 * behind session auth, and Next's optimiser fetches them server-side without
 * the user's cookie, so it would only ever get a 401.
 */
export function CatalogThumb({ src, width = BOX_HEIGHT_PX, className }: CatalogThumbProps) {
  const isVector = src !== null && src.endsWith(".svg");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        src && "border border-slate-200 bg-white",
        className
      )}
      style={{ width, height: BOX_HEIGHT_PX }}
    >
      {src === null ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={isVector ? src : `${src}?w=${SRC_WIDTH_2X}`}
          srcSet={
            isVector
              ? undefined
              : `${src}?w=${SRC_WIDTH_1X} 1x, ${src}?w=${SRC_WIDTH_2X} 2x`
          }
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-0.5"
        />
      )}
    </span>
  );
}
