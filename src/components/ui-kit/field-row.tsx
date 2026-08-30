import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared classes for a raw `<input>`/`<select>`/`<textarea>` styled per the
 * design direction: 44px tall (touch target), 16px text (no iOS zoom-on-
 * focus), brand focus ring. Exported so screens that need a bare input
 * outside a `<FieldRow>` (e.g. a search box in a `PageHeader`) stay visually
 * consistent without duplicating the class list.
 */
export const fieldInputClass =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-base text-brand-dark outline-none transition-colors placeholder:text-slate-500 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60";

type FieldRowProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Consistent label + control + error/hint row for forms. Doesn't render the
 * control itself (pass it as `children`, typically a plain `<input>` using
 * `fieldInputClass`) so it works for inputs, selects, and textareas alike.
 * Intended to sit inside a `grid lg:grid-cols-2` form per the two-column
 * desktop layout direction; full-width fields just span both columns.
 *
 * When `error` is set and `children` is a single element (true for every
 * current caller), the control is cloned with `aria-describedby` pointing at
 * the error message and `aria-invalid="true"` — so a screen reader announces
 * the error not just at submit time (the `role="alert"` below) but also
 * whenever the field regains focus later.
 */
export function FieldRow({ label, htmlFor, error, hint, required, className, children }: FieldRowProps) {
  const errorId = error ? `${htmlFor}-error` : undefined;

  const control =
    errorId && isValidElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)
      ? cloneElement(children, {
          "aria-describedby": children.props["aria-describedby"]
            ? `${children.props["aria-describedby"]} ${errorId}`
            : errorId,
          "aria-invalid": true,
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-brand-dark">
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
