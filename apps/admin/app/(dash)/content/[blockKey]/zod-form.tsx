"use client";

import { useState } from "react";
import { parseBlock } from "@signex/shared";
import type { FieldPlan } from "@/app/lib/zodform-fields";

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
    <div className="flex flex-col gap-1">
      <label htmlFor={`field-${field.name}`} className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {field.label}
      </label>
      <input
        id={`field-${field.name}`}
        type="text"
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
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
    <fieldset className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
      <legend className="px-1 text-xs font-medium text-gray-600 uppercase tracking-wide">
        {field.label}
      </legend>
      <div className="flex flex-col gap-1">
        <label htmlFor={`field-${field.name}-en`} className="text-xs text-gray-500">
          English (en)
        </label>
        <input
          id={`field-${field.name}-en`}
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          placeholder="English"
          value={v.en ?? ""}
          onChange={(e) => onChange({ ...v, en: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`field-${field.name}-vi`} className="text-xs text-gray-500">
          Vietnamese (vi)
        </label>
        <input
          id={`field-${field.name}-vi`}
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          placeholder="Vietnamese"
          value={v.vi ?? ""}
          onChange={(e) => onChange({ ...v, vi: e.target.value })}
        />
      </div>
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
    <div className="flex flex-col gap-2 rounded-md border border-gray-200 p-3">
      <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{field.label}</span>
      <div className="flex flex-col gap-1">
        <label htmlFor={`field-${field.name}-asset`} className="text-xs text-gray-500">
          Asset
        </label>
        <select
          id={`field-${field.name}-asset`}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
      </div>
    </div>
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
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`field-${field.name}`} className="text-xs font-medium text-gray-600 uppercase tracking-wide">
        {field.label}{" "}
        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-xs font-normal text-amber-700 normal-case tracking-normal">
          raw JSON
        </span>
      </label>
      <textarea
        id={`field-${field.name}`}
        className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
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
      />
      {parseError && (
        <p id={`field-${field.name}-err`} className="text-xs text-red-600" role="alert">
          {parseError}
        </p>
      )}
    </div>
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

  const msgColor =
    msg?.type === "success"
      ? "bg-green-50 border-green-200 text-green-800"
      : msg?.type === "warn"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-red-50 border-red-200 text-red-700";

  return (
    <div className="flex max-w-xl flex-col gap-5">
      {fields.length === 0 && (
        <p className="text-sm text-gray-500">No editable fields derived for this block.</p>
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
          className={`rounded-md border px-4 py-3 text-sm ${msgColor}`}
        >
          {msg.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || jsonErrors.size > 0}
          aria-disabled={busy || jsonErrors.size > 0}
          onClick={onSave}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
        {busy && (
          <span className="text-xs text-gray-500" aria-live="polite">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}
