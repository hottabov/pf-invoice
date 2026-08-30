import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Rendered top-right on desktop, stacked full-width below the title on
   * mobile — typically the page's primary "New X" button(s). */
  actions?: React.ReactNode;
  /** Same-origin relative path for a back link rendered above the title
   * (e.g. a company page linking back to /clients). */
  backHref?: string;
  backLabel?: string;
  className?: string;
};

/**
 * Standard page-level header used by every (app) screen: optional back
 * link, 22px/600 title, muted description, and an actions slot. Desktop
 * puts actions on the same row as the title; mobile stacks them below so
 * full-width buttons stay easy to tap.
 */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="focus-ring inline-flex w-fit items-center gap-1 rounded-md text-sm font-medium text-slate-500 transition-colors hover:text-brand-dark"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold text-balance text-brand-dark">
            {title}
          </h1>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
