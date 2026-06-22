"use client";

import { useActionState } from "react";
import { rollbackAction, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface RollbackFormProps {
  toVersion: number;
}

const initialState: ActionState = {};

export function RollbackForm({ toVersion }: RollbackFormProps) {
  const [state, formAction, pending] = useActionState(
    rollbackAction,
    initialState,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Roll back to version ${toVersion}? This will immediately change the live site.`,
    );
    if (!confirmed) {
      e.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {state.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-xs text-destructive"
          title={state.error}
        >
          Error: {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" aria-live="polite" className="text-xs text-success">
          Rolled back.
        </p>
      )}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="toVersion" value={toVersion} />
        <Label
          htmlFor={`restore-draft-${toVersion}`}
          className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground font-normal"
        >
          <input
            id={`restore-draft-${toVersion}`}
            type="checkbox"
            name="restoreWorkingState"
            className="h-3.5 w-3.5 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          restore draft
        </Label>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Rolling back…" : "Roll back"}
        </Button>
      </form>
    </div>
  );
}
