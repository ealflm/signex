import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  /** Visible label text. */
  label: React.ReactNode;
  /** id of the control this label points at (Label htmlFor). Required for a11y. */
  htmlFor: string;
  /** Optional helper text under the control (text-xs muted). */
  hint?: React.ReactNode;
  /** Optional error message (text-xs destructive). Replaces the hint when present. */
  error?: React.ReactNode;
  /** Marks the field required (adds a muted asterisk). */
  required?: boolean;
  /** The control — an <Input>, <Textarea>, <Select>, etc. */
  children: React.ReactNode;
  className?: string;
}

/**
 * Consistent labeled form row: shadcn <Label> + control slot + hint/error.
 * The control must carry id={htmlFor}; wire aria-describedby / aria-invalid on
 * the control yourself when an error is shown.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-muted-foreground" aria-hidden>
            {" *"}
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
