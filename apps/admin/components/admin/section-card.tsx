import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  /** Optional card title (text-sm font-semibold). */
  title?: React.ReactNode;
  /** Optional description under the title (text-xs muted). */
  description?: React.ReactNode;
  /** Optional right-aligned header actions (tabs, buttons). */
  actions?: React.ReactNode;
  /** Optional footer row (separated by a top border). */
  footer?: React.ReactNode;
  /** Card body. */
  children?: React.ReactNode;
  className?: string;
  /** Override body padding (default p-5). Pass false to remove padding (e.g. for tables that pad their own cells). */
  bodyClassName?: string;
}

/**
 * Token-driven content card matching the Overview surfaces:
 * "rounded-xl border border-border bg-card". Renders an optional header row
 * (title + description + actions) and an optional footer separated by borders.
 */
export function SectionCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section className={cn("rounded-xl border border-border bg-card", className)}>
      {hasHeader && (
        <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {title && (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            )}
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </header>
      )}
      <div className={cn(bodyClassName ?? "p-5")}>{children}</div>
      {footer && (
        <footer className="border-t border-border px-5 py-3">{footer}</footer>
      )}
    </section>
  );
}
