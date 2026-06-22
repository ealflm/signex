import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** Lucide icon component (rendered size-6, muted). */
  icon: LucideIcon;
  /** Headline (text-sm font-medium foreground). */
  title: React.ReactNode;
  /** Optional supporting line (text-xs muted). */
  description?: React.ReactNode;
  /** Optional CTA — pass a shadcn <Button> (or link-as-button). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Centered empty state, mirroring the leads-table / chart empties:
 * icon size-6 text-muted-foreground/60, title text-sm font-medium,
 * description text-xs muted, optional CTA below.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-5 py-14 text-center",
        className,
      )}
    >
      <Icon className="size-6 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
