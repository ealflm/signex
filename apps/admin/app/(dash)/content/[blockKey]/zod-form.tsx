"use client";

import { useState } from "react";
import { parseBlock, type BlockKey } from "@signex/shared";
import type { FieldPlan } from "@/app/lib/zodform-fields";
import { EmptyState } from "@/components/admin/empty-state";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { FieldEditor, type FieldAssetRow } from "@/app/(dash)/editor/_fields/field-editor";

interface Props {
  blockKey: string;
  themeId: string;
  fields: FieldPlan[];
  initialData: Record<string, unknown>;
  initialExpectedDraftRevision: number;
  assets: FieldAssetRow[];
}

// ---------------------------------------------------------------------------
// ZodForm (main export)
// ---------------------------------------------------------------------------

export function ZodForm({
  blockKey,
  themeId,
  fields,
  initialData,
  initialExpectedDraftRevision,
  assets,
}: Props) {
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "warn" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Set<string>>(new Set());
  // Track the latest draft revision so consecutive saves send the correct optimistic-lock value.
  const [expectedDraftRevision, setExpectedDraftRevision] = useState(initialExpectedDraftRevision);

  function handleValidityChange(name: string, valid: boolean) {
    setJsonErrors((prev) => {
      const next = new Set(prev);
      if (valid) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function onSave() {
    // Gate: if any JSON field is currently invalid, abort before submitting stale data.
    if (jsonErrors.size > 0) {
      setMsg({ text: "Fix the highlighted JSON field(s) before saving.", type: "error" });
      return;
    }

    setBusy(true);
    setMsg(null);

    // Client-side validation with the 2-arg parseBlock(key, data) overload before hitting the server.
    // This catches schema errors early without a round-trip.
    try {
      parseBlock(blockKey as BlockKey, data);
    } catch (e) {
      setBusy(false);
      const isZod = e instanceof Error && e.name === "ZodError";
      const zodIssues = isZod
        ? (e as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }).issues
        : null;
      const detail = zodIssues
        ? zodIssues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
        : (e instanceof Error ? e.message : "Unknown validation error");
      setMsg({ text: `Validation error: ${detail}`, type: "error" });
      return;
    }

    let res: Response;
    try {
      res = await fetch(`/admin-api/themes/${themeId}/save-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits: [{ key: blockKey, data }], expectedDraftRevision }),
      });
    } catch (e) {
      setBusy(false);
      setMsg({ text: e instanceof Error ? e.message : "Network error", type: "error" });
      return;
    }

    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { draftRevision?: number } | null;
      if (body && typeof body.draftRevision === "number") {
        setExpectedDraftRevision(body.draftRevision);
      }
      setMsg({ text: "Saved to draft.", type: "success" });
    } else if (res.status === 409) {
      setMsg({
        text: "Conflict (409) — the theme draft changed. Reload to get the latest before saving again.",
        type: "warn",
      });
    } else if (res.status === 422) {
      const b = (await res.json().catch(() => null)) as { detail?: string; code?: string } | null;
      setMsg({
        text: `Validation failed (422)${b?.detail ? ` — ${b.detail}` : b?.code ? ` — ${b.code}` : ""}.`,
        type: "error",
      });
    } else {
      let detail = `Error ${res.status}`;
      try {
        const b = (await res.json()) as { error?: string };
        if (b.error) detail = b.error;
      } catch { /* ignore */ }
      setMsg({ text: detail, type: "error" });
    }

    setBusy(false);
  }

  const msgBannerClass =
    msg?.type === "success"
      ? "border-success/30 bg-success/10 text-success"
      : msg?.type === "warn"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive";

  return (
    <div className="flex max-w-xl flex-col gap-5">
      {fields.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No editable fields"
          description="No editable fields were derived for this block."
        />
      )}

      {fields.map((f) => (
        <FieldEditor
          key={f.name}
          field={f}
          value={data[f.name]}
          assets={assets}
          onChange={(v) => setData((d) => ({ ...d, [f.name]: v }))}
          onValidityChange={handleValidityChange}
        />
      ))}

      {msg && (
        <p
          role="alert"
          aria-live="polite"
          className={`rounded-md border px-4 py-3 text-sm ${msgBannerClass}`}
        >
          {msg.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={busy || jsonErrors.size > 0}
          aria-disabled={busy || jsonErrors.size > 0}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save draft"}
        </Button>
        {busy && (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}
