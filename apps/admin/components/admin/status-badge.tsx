import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "success"
  | "warning"
  | "neutral"
  | "accent"
  | "destructive";

/**
 * Per-tone classes. Written as full static literals (NOT interpolated) so the
 * Tailwind v4 scanner can see every class — dynamic `bg-${tone}/10` would be
 * purged. All colors are tokens, so light + dark both work.
 */
const TONE: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  accent: "border-primary/30 bg-primary/10 text-primary",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  /** Semantic tone — maps to a token color set. Default "neutral". */
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}

/**
 * Pill status badge matching the Overview badges. Renders a token-tinted pill;
 * pair the label with an icon/dot child for color-independent meaning (a11y).
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
