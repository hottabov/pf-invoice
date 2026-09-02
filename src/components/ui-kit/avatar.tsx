import { cn } from "@/lib/utils";
import { avatarColor, getInitials } from "@/lib/avatar";

type AvatarProps = {
  /** Display name, or `null`/missing for a user who hasn't set one. */
  name?: string | null;
  /** Always required — every `User` has one, and it's the ultimate initials/
   * colour fallback when `name` is unset. */
  email: string;
  /** A resolved `/api/files/<name>` URL (see `User.image` — reused as the
   * avatar column, src/lib/queries/documents.ts has the read-side reuse
   * note), or `null`/missing to always show the initials fallback. */
  image?: string | null;
  /** Square size in pixels. */
  size?: number;
  className?: string;
};

/**
 * The one avatar renderer every screen shares (dashboard greeting, users
 * list/edit, account settings): the person's photo when `image` is set,
 * otherwise their initials on a colour deterministically derived from their
 * name/email (see src/lib/avatar.ts) so the same person always gets the
 * same colour. Nothing else in the app should hand-roll a second avatar —
 * see the sibling `ImageUpload` (src/components/catalog/image-upload.tsx)
 * for the *editing* flow (upload/replace/remove), which this component
 * deliberately doesn't attempt — it only ever displays.
 */
export function Avatar({ name = null, email, image = null, size = 40, className }: AvatarProps) {
  const label = name?.trim() || email;

  if (image) {
    return (
      // Plain <img>, not next/image: this is a small, already-served local
      // file (or, for the print sheets' own header/prepared-by images, a
      // base64 data URI) — no benefit from next/image's optimization
      // pipeline, and it keeps this component usable outside a Next.js
      // request context the same way ImageUpload's preview already is.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={label}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const initials = getInitials(name, email);
  const background = avatarColor(name?.trim() || email);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        className
      )}
      style={{ width: size, height: size, backgroundColor: background, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </div>
  );
}
