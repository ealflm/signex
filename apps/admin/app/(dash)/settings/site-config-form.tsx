"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { updateSiteConfigAction, type SettingsActionState } from "./actions";
import { Field } from "@/components/admin/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMPTY: SettingsActionState = {};

export function SiteConfigForm({
  ga4Id,
  canEdit,
}: {
  ga4Id: string;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateSiteConfigAction,
    EMPTY,
  );

  // Toast exactly once per successful save.
  const processed = useRef(false);
  useEffect(() => {
    if (state.success && !processed.current) {
      processed.current = true;
      toast.success("Settings saved.");
    }
    if (!state.success) processed.current = false;
  }, [state.success]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {state.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      <Field
        label="Google Analytics measurement ID (GA4)"
        htmlFor="ga4Id"
        hint="Leave empty to disable Google Analytics. Find it in GA4 → Admin → Data Streams (looks like G-XXXXXXXXXX)."
      >
        <Input
          id="ga4Id"
          name="ga4Id"
          type="text"
          defaultValue={ga4Id}
          placeholder="G-XXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          disabled={!canEdit || pending}
        />
      </Field>

      <div>
        <Button type="submit" disabled={!canEdit || pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
