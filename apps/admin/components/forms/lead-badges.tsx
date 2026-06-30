import * as React from "react";
import { Badge } from "@/components/ui/badge";

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
