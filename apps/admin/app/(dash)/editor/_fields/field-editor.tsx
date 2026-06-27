"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { FieldPlan } from "@/app/lib/zodform-fields";
import { Field } from "@/components/admin/field";
import { StatusBadge } from "@/components/admin/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface FieldAssetRow {
  id: string;
  originalName: string;
}

export interface FieldEditorProps {
  field: FieldPlan;
  value: unknown;
  assets: FieldAssetRow[];
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
  /**
   * When provided, AssetRef/VideoRef fields render a "Choose media…" button
   * that calls this (the editor panel opens MediaPickerDialog); when omitted
   * they fall back to the native <select>.
   */
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
  /**
   * Two-way highlight (panel→canvas). Fired with the field's full dotted name
   * (e.g. "titleTop" / "title.accent") when an input inside it gains focus; the
   * shell posts {type:"highlight", field:`${blockKey}.${name}`} to the iframe.
   */
  onFieldFocus?: (fieldName: string) => void;
  /**
   * Two-way highlight (canvas→panel). When `flashField.name` matches this field's
   * dotted name, the field scrolls into view and rings. `nonce` bumps each time so
   * re-focusing the same canvas leaf re-triggers the flash.
   */
  flashField?: { name: string; nonce: number } | null;
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
  onPickMedia,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  assets: FieldAssetRow[];
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
}) {
  const v = (value as { assetId?: string; alt?: { en?: string; vi?: string } }) ?? {};
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}
      </legend>
      {onPickMedia ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPickMedia(field.name, "image")}
        >
          {v.assetId ? "Replace image…" : "Choose image…"}
        </Button>
      ) : (
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
      )}
    </fieldset>
  );
}

function VideoRefField({
  field,
  value,
  onChange,
  assets,
  onPickMedia,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  assets: FieldAssetRow[];
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
}) {
  const v =
    (value as {
      posterAssetId?: string;
      mp4AssetId?: string;
      webmAssetId?: string;
    }) ?? {};
  // Three asset pickers — one per VideoRef id (poster / mp4 / webm).
  const slots: Array<{ key: "posterAssetId" | "mp4AssetId" | "webmAssetId"; label: string }> = [
    { key: "posterAssetId", label: "Poster image" },
    { key: "mp4AssetId", label: "MP4 video" },
    { key: "webmAssetId", label: "WebM video (optional)" },
  ];
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}
      </legend>
      {onPickMedia ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPickMedia(field.name, "video")}
        >
          {v.posterAssetId || v.mp4AssetId ? "Replace video…" : "Choose video…"}
        </Button>
      ) : (
        slots.map((slot) => (
          <Field key={slot.key} label={slot.label} htmlFor={`field-${field.name}-${slot.key}`}>
            <select
              id={`field-${field.name}-${slot.key}`}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              value={v[slot.key] ?? ""}
              onChange={(e) =>
                onChange({ ...v, [slot.key]: e.target.value || undefined })
              }
            >
              <option value="">— none —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.originalName}
                </option>
              ))}
            </select>
          </Field>
        ))
      )}
    </fieldset>
  );
}

// Renders a (one-level) nested object as a grouped fieldset, with each child rendered by the
// same FieldEditor. The object value is read/written as a whole; nested JSON validity bubbles
// up through onValidityChange under a namespaced key (`${parent}.${child}`).
function ObjectField({
  field,
  value,
  onChange,
  onValidityChange,
  assets,
  onPickMedia,
  onFieldFocus,
  flashField,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
  assets: FieldAssetRow[];
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
  onFieldFocus?: (fieldName: string) => void;
  flashField?: { name: string; nonce: number } | null;
}) {
  const obj = (value as Record<string, unknown>) ?? {};
  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}
      </legend>
      {(field.children ?? []).map((child) => (
        <FieldEditor
          key={child.name}
          field={{ ...child, name: `${field.name}.${child.name}` }}
          value={obj[child.name]}
          assets={assets}
          onChange={(v) => onChange({ ...obj, [child.name]: v })}
          onValidityChange={onValidityChange}
          onPickMedia={onPickMedia}
          onFieldFocus={onFieldFocus}
          flashField={flashField}
        />
      ))}
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

// ---------------------------------------------------------------------------
// FieldEditor switch (exported)
// ---------------------------------------------------------------------------

export function FieldEditor({
  field,
  value,
  onChange,
  onValidityChange,
  assets,
  onPickMedia,
  onFieldFocus,
  flashField,
}: FieldEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // Flash this field when the matching canvas leaf is focused (canvas→panel highlight).
  const flashNonce = flashField && flashField.name === field.name ? flashField.nonce : null;
  useEffect(() => {
    if (flashNonce == null) return;
    const el = wrapRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("sx-field-flash");
    const t = window.setTimeout(() => el.classList.remove("sx-field-flash"), 900);
    return () => window.clearTimeout(t);
  }, [flashNonce]);

  let inner: ReactElement;
  if (field.kind === "string") {
    inner = <StringField field={field} value={value} onChange={onChange} />;
  } else if (field.kind === "localized") {
    inner = <LocalizedField field={field} value={value} onChange={onChange} />;
  } else if (field.kind === "assetRef") {
    // TODO: alt editing
    inner = (
      <AssetRefField
        field={field}
        value={value}
        onChange={onChange}
        assets={assets}
        onPickMedia={onPickMedia}
      />
    );
  } else if (field.kind === "videoRef") {
    inner = (
      <VideoRefField
        field={field}
        value={value}
        onChange={onChange}
        assets={assets}
        onPickMedia={onPickMedia}
      />
    );
  } else if (field.kind === "object") {
    inner = (
      <ObjectField
        field={field}
        value={value}
        onChange={onChange}
        onValidityChange={onValidityChange}
        assets={assets}
        onPickMedia={onPickMedia}
        onFieldFocus={onFieldFocus}
        flashField={flashField}
      />
    );
  } else {
    // localizedArray, array, json → raw JSON textarea (client-side parseBlock validates on submit)
    inner = (
      <JsonField
        field={field}
        value={value}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
  }

  // Layout-neutral wrapper: catches focus from any input within so the panel field can drive the
  // panel→canvas highlight. stopPropagation keeps a nested-object parent from also firing (the leaf's
  // dotted name is the canvas identity); object-recursion threads onFieldFocus to the leaves directly.
  return (
    <div
      ref={wrapRef}
      onFocus={
        onFieldFocus
          ? (e) => {
              e.stopPropagation();
              onFieldFocus(field.name);
            }
          : undefined
      }
    >
      {inner}
    </div>
  );
}
