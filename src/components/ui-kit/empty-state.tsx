import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

/** Centered icon + message (+ optional action) shown in place of an empty
 * list/table — used whenever a search/filter or an unpopulated section has
 * nothing to render. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="size-6 text-slate-400" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-brand-dark">{title}</p>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
