import * as React from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Form-key pill. quote = accent tint, contact = neutral outline.
 * Label is color-independent (text carries meaning) for a11y.
 */
export function FormBadge({ formKey }: { formKey: string }) {
  const isQuote = formKey === "quote";
  return (
    <Badge
      variant="outline"
      className={
        isQuote
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground"
      }
    >
      {isQuote ? "Quote" : "Contact"}
    </Badge>
  );
}

/**
 * Submission status pill. NEW = accent (dot + label), READ = muted secondary,
 * ARCHIVED = neutral outline. The text always names the status so meaning never
 * depends on color alone.
 */
export function StatusBadge({ status }: { status: string }) {
  if (status === "NEW") {
    return (
      <Badge className="gap-1.5 border-primary/25 bg-primary/10 text-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        New
      </Badge>
    );
  }
  if (status === "READ") {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Read
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Archived
    </Badge>
  );
}
