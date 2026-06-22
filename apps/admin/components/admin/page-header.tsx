import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** h1 — page title. */
  title: React.ReactNode;
  /** Optional one-line description under the title. */
  subtitle?: React.ReactNode;
  /** Optional right-aligned actions slot (buttons, tabs, etc.). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standard page header for dash panels. Matches the Overview headers:
 * h1 = text-2xl font-semibold tracking-tight, subtitle = text-sm muted.
 * Renders a semantic <header> landmark.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
