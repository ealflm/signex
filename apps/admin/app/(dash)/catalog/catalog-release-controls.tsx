"use client";

import { useActionState } from "react";
import { Loader2, RotateCcw, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  publishCatalog,
  rollbackCatalog,
  type CatalogActionState,
} from "./actions";

const empty: CatalogActionState = {};

/**
 * Publish-catalog control for the page header. PUBLISHER-gated at render (the
 * server re-checks). Disabled when the draft is clean; posts the current
 * draftRevision as the optimistic lock.
 */
export function PublishCatalogButton({
  draftRevision,
  dirty,
}: {
  draftRevision: number;
  dirty: boolean;
}) {
  const [state, formAction, pending] = useActionState(publishCatalog, empty);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="expectedDraftRevision" value={draftRevision} />
      {state.error && (
        <span role="alert" className="text-xs text-destructive">
          {state.error}
        </span>
      )}
      <Button
        type="submit"
        disabled={pending || !dirty}
        aria-disabled={pending || !dirty}
        title={
          dirty ? "Publish the catalog live" : "No unpublished catalog changes"
        }
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <UploadCloud aria-hidden />
        )}
        {pending ? "Publishing…" : "Publish catalog"}
      </Button>
    </form>
  );
}

/**
 * Roll the live catalog back to an earlier version. Confirm-guarded; PUBLISHER-
 * gated at render (the server re-checks).
 */
export function RollbackCatalogButton({ toVersion }: { toVersion: number }) {
  const [state, formAction, pending] = useActionState(rollbackCatalog, empty);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Roll the live catalog back to v${toVersion}? This publishes a new release with v${toVersion}'s contents.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="toVersion" value={toVersion} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-disabled={pending}
        title={state.error ?? `Roll back to v${toVersion}`}
        className="gap-1.5"
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <RotateCcw aria-hidden />
        )}
        Roll back
      </Button>
    </form>
  );
}
