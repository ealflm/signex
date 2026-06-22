"use client";

import { useState } from "react";
import { parseBlock } from "@signex/shared";
import type { FieldPlan } from "@/app/lib/zodform-fields";
import { Field } from "@/components/admin/field";
import { EmptyState } from "@/components/admin/empty-state";
import { StatusBadge } from "@/components/admin/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface AssetRow {
  id: string;
  originalName: string;
}

interface Props {
  kind: string;
  blockKey: string;
  fields: FieldPlan[];
  initialData: Record<string, unknown>;
  expectedRevision: number;
  assets: AssetRow[];
}

// ---------------------------------------------------------------------------
// Individual field editors
// ---------------------------------------------------------------------------

function StringField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <Field label={field.label} htmlFor={`field-${field.name}`}>
      <Input
        id={`field-${field.name}`}
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function LocalizedField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = (value as { en?: string; vi?: string }) ?? {};
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}
      </legend>
      <Field label="English (en)" htmlFor={`field-${field.name}-en`}>
        <Input
          id={`field-${field.name}-en`}
          type="text"
          placeholder="English"
          value={v.en ?? ""}
          onChange={(e) => onChange({ ...v, en: e.target.value })}
        />
      </Field>
      <Field label="Vietnamese (vi)" htmlFor={`field-${field.name}-vi`}>
        <Input
          id={`field-${field.name}-vi`}
          type="text"
          placeholder="Vietnamese"
          value={v.vi ?? ""}
          onChange={(e) => onChange({ ...v, vi: e.target.value })}
        />
      </Field>
    </fieldset>
  );
}

function AssetRefField({
  field,
  value,
  onChange,
  assets,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  assets: AssetRow[];
}) {
  const v = (value as { assetId?: string; alt?: { en?: string; vi?: string } }) ?? {};
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}
      </legend>
      <Field label="Asset" htmlFor={`field-${field.name}-asset`}>
        {/* Native select: value posts via client state (onChange), not form name= */}
        <select
          id={`field-${field.name}-asset`}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={v.assetId ?? ""}
          onChange={(e) => onChange({ ...v, assetId: e.target.value || undefined })}
        >
          <option value="">— none —</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.originalName}
            </option>
          ))}
        </select>
      </Field>
    </fieldset>
  );
}

function JsonField({
  field,
  value,
  onChange,
  onValidityChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const label = (
    <>
      {field.label}{" "}
      <StatusBadge tone="warning" className="ml-1 normal-case tracking-normal">
        raw JSON
      </StatusBadge>
    </>
  );

  return (
    <Field
      label={label}
      htmlFor={`field-${field.name}`}
      error={parseError ?? undefined}
    >
      <Textarea
        id={`field-${field.name}`}
        className="font-mono text-xs"
        rows={6}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setParseError(null);
            onValidityChange(field.name, true);
          } catch {
            setParseError("Invalid JSON — will not be saved until fixed.");
            onValidityChange(field.name, false);
          }
        }}
        aria-describedby={parseError ? `field-${field.name}-err` : undefined}
        aria-invalid={parseError ? true : undefined}
      />
    </Field>
  );
}

function FieldEditor({
  field,
  value,
  onChange,
  onValidityChange,
  assets,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
  assets: AssetRow[];
}) {
  if (field.kind === "string") {
    return <StringField field={field} value={value} onChange={onChange} />;
  }
  if (field.kind === "localized") {
    return <LocalizedField field={field} value={value} onChange={onChange} />;
  }
  if (field.kind === "assetRef") {
    // TODO: alt editing
    return <AssetRefField field={field} value={value} onChange={onChange} assets={assets} />;
  }
  // localizedArray, array, json → raw JSON textarea (client-side parseBlock validates on submit)
  return <JsonField field={field} value={value} onChange={onChange} onValidityChange={onValidityChange} />;
}

// ---------------------------------------------------------------------------
// ZodForm (main export)
// ---------------------------------------------------------------------------

export function ZodForm({
  kind,
  blockKey,
  fields,
  initialData,
  expectedRevision,
  assets,
}: Props) {
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [msg, setMsg] = useState<{ text: string; type: "success" | "error" | "warn" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [jsonErrors, setJsonErrors] = useState<Set<string>>(new Set());

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

    // Client-side validation with parseBlock(kind, blockKey, data) before hitting the server.
    // This catches schema errors early without a round-trip.
    try {
      parseBlock(kind, blockKey, data);
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
      res = await fetch(`/admin-api/content/blocks/${kind}/${blockKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, expectedRevision }),
      });
    } catch (e) {
      setBusy(false);
      setMsg({ text: e instanceof Error ? e.message : "Network error", type: "error" });
      return;
    }

    if (res.ok) {
      setMsg({ text: "Saved successfully.", type: "success" });
    } else if (res.status === 409) {
      setMsg({
        text: "Conflict (409) — someone else edited this block. Reload the page to get the latest version before saving again.",
        type: "warn",
      });
    } else if (res.status === 422) {
      let detail = "";
      try {
        const b = (await res.json()) as { error?: string; issues?: unknown[] };
        if (b.error) detail = ` — ${b.error}`;
        else if (b.issues) detail = ` — see console for validation issues`;
      } catch { /* ignore */ }
      setMsg({ text: `Validation failed (422)${detail}`, type: "error" });
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
