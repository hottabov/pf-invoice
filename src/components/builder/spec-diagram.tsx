/**
 * A small illustration bound to one exact spec value (see `SpecImage`'s doc
 * comment in schema.prisma) — e.g. the screen-side "+Y"/"-Y" diagram beside
 * `ProductionSpecEditor`'s dropdown. Renders the uploaded image when one
 * exists; otherwise a dashed placeholder box of the exact same size, so the
 * owner can draw art to a known frame and the layout never jumps once real
 * artwork replaces it. The placeholder deliberately isn't a broken `<img>`
 * (an empty/invalid `src`) — a plain styled box reads as "not drawn yet",
 * not as something gone wrong.
 *
 * `DIAGRAM_SIZE_PX` (96px, Tailwind's `size-24`) is the exact box the owner
 * should draw to — see the box's own callers for where that number is
 * quoted back to them.
 */
export const DIAGRAM_SIZE_PX = 96;

export function SpecDiagram({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={DIAGRAM_SIZE_PX}
        height={DIAGRAM_SIZE_PX}
        className="size-24 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${alt} (diagram not uploaded yet)`}
      className="flex size-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-1 text-center text-[10px] leading-tight text-slate-400"
    >
      No diagram yet
    </div>
  );
}
