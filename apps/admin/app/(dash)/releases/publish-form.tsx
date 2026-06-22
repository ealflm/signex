"use client";

import { useActionState } from "react";
import { publishAction, type ActionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/field";

interface PublishFormProps {
  expectedRevision: number;
  dirty: boolean;
}

const initialState: ActionState = {};

export function PublishForm({ expectedRevision, dirty }: PublishFormProps) {
  const [state, formAction, pending] = useActionState(
    publishAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      {/* Optimistic-lock value — must be the CURRENT working revision from /api/releases/diff */}
      <input type="hidden" name="expectedRevision" value={expectedRevision} />

      {state.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {state.error === "Conflict" ||
          state.error?.toLowerCase().includes("conflict") ||
          state.error?.includes("409")
            ? "Publish failed: the working state has changed since this page loaded (optimistic lock). Refresh and try again."
            : `Publish failed: ${state.error}`}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm text-success"
        >
          Published successfully.
        </p>
      )}

      <div className="flex items-end gap-3">
        <Field
          label="Release note (optional)"
          htmlFor="publish-note"
          className="flex-none"
        >
          <Textarea
            id="publish-note"
            name="note"
            rows={2}
            placeholder="Describe what changed…"
            className="w-72"
            disabled={pending || !dirty}
          />
        </Field>

        <Button
          type="submit"
          disabled={pending || !dirty}
          aria-disabled={pending || !dirty}
        >
          {pending ? "Publishing…" : "Publish"}
        </Button>
      </div>

      {!dirty && (
        <p className="text-xs text-muted-foreground">
          No unpublished changes — publish is only available when the working
          state differs from the last published version.
        </p>
      )}
    </form>
  );
}
