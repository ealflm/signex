"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { isVideoRef, type MediaRef, type Overlay } from "@signex/shared";
import { OverlayField } from "../../visual/overlay-field";
import type { FieldPlan } from "@/app/lib/zodform-fields";
import { Field } from "@/components/admin/field";
import { StatusBadge } from "@/components/admin/status-badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// A sensible empty value for a newly-added array item / list line, by field kind.
function defaultForField(plan: FieldPlan): unknown {
  switch (plan.kind) {
    case "string":
      return "";
    case "boolean":
      return false;
    case "localized":
      return { en: "", vi: "" };
    case "localizedArray":
      return { en: [], vi: [] };
    case "stringArray":
    case "array":
      return [];
    case "assetRef":
    case "videoRef":
    case "mediaRef":
      return {};
    case "object":
      return Object.fromEntries(
        (plan.children ?? []).map((c) => [c.name, defaultForField(c)]),
      );
    case "overlay":
      return undefined; // optional overlay defaults to absent ("Không")
    default:
      return null;
  }
}

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
  /**
   * This plan came through a mode lens (`lensFields`), so a container's `children` are a PRUNED
   * subset of the real shape rather than the whole of it. False/omitted in Content mode, which
   * always passes the full plan.
   *
   * Editing is unaffected — every value here is read and written by key off the value itself, so a
   * hidden sibling is carried through untouched. What is NOT safe under a partial plan is MINTING a
   * value from `children`: `ArrayField`'s "Add item" builds a fresh item out of exactly the child
   * plans it can see, so under a lens it would silently create an item missing every field the lens
   * pruned. Hence the structural controls are hidden when this is set — which is also where the
   * spec puts them ("Reordering/adding array items … Content mode's form remains the route",
   * docs/superpowers/specs/2026-07-14-editor-modes-design.md §9).
   */
  partial?: boolean;
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

// kind:"color" — a shared HexA leaf marked `.describe("color")`. Native picker for the RGB part +
// a hex text input that also accepts #rrggbbaa. Empty text = undefined = "use the default"
// (the field is optional in the schema; the API's zod validates the hex on save).
function ColorField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const hex = typeof value === "string" ? value : "";
  const rgb = /^#[0-9a-fA-F]{6}/.test(hex) ? hex.slice(0, 7) : "#888888";
  return (
    <Field label={field.label} htmlFor={`field-${field.name}`}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${field.label} — chọn màu`}
          value={rgb}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-1"
        />
        <Input
          id={`field-${field.name}`}
          value={hex}
          placeholder="#rrggbb — bỏ trống = mặc định"
          onChange={(e) => {
            const v = e.target.value.trim();
            onChange(v === "" ? undefined : v);
          }}
        />
      </div>
    </Field>
  );
}

function BooleanField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <label
      htmlFor={`field-${field.name}`}
      className="flex cursor-pointer items-center gap-2 py-1"
    >
      <Checkbox
        id={`field-${field.name}`}
        checked={Boolean(value)}
        onCheckedChange={(c) => onChange(c === true)}
      />
      <span className="text-sm text-foreground">{field.label}</span>
    </label>
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

// Renders a nested object as a grouped fieldset, with each child rendered by the same FieldEditor.
// Nested JSON validity bubbles up through onValidityChange under a namespaced key
// (`${parent}.${child}`).
//
// The object value is read and written BY KEY, never rebuilt from `field.children`: the spread in
// onChange carries every sibling through, including ones a mode lens pruned from `children` and so
// from this render. That is what lets a lens hand this a partial plan without changing what a save
// produces.
function ObjectField({
  field,
  value,
  onChange,
  onValidityChange,
  assets,
  onPickMedia,
  onFieldFocus,
  flashField,
  partial,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
  assets: FieldAssetRow[];
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
  onFieldFocus?: (fieldName: string) => void;
  flashField?: { name: string; nonce: number } | null;
  partial?: boolean;
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
          partial={partial}
        />
      ))}
    </fieldset>
  );
}

// Bilingual list ({ en: string[], vi: string[] }) — parallel rows so en[i]/vi[i] stay aligned.
function LocalizedArrayField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = (value as { en?: string[]; vi?: string[] }) ?? {};
  const en = v.en ?? [];
  const vi = v.vi ?? [];
  const rows = Math.max(en.length, vi.length);

  const commit = (nextEn: string[], nextVi: string[]) =>
    onChange({ en: nextEn, vi: nextVi });
  const setCell = (i: number, locale: "en" | "vi", text: string) => {
    const ne = [...en];
    const nv = [...vi];
    while (ne.length <= i) ne.push("");
    while (nv.length <= i) nv.push("");
    if (locale === "en") ne[i] = text;
    else nv[i] = text;
    commit(ne, nv);
  };
  const addRow = () => commit([...en, ""], [...vi, ""]);
  const removeRow = (i: number) =>
    commit(en.filter((_, j) => j !== i), vi.filter((_, j) => j !== i));

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({rows} line{rows === 1 ? "" : "s"})
        </span>
      </legend>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground">
            {i + 1}
          </span>
          <div className="flex flex-1 flex-col gap-1">
            <Input
              placeholder="English"
              value={en[i] ?? ""}
              onChange={(e) => setCell(i, "en", e.target.value)}
            />
            <Input
              placeholder="Vietnamese"
              value={vi[i] ?? ""}
              onChange={(e) => setCell(i, "vi", e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label={`Remove line ${i + 1}`}
            onClick={() => removeRow(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </div>
    </fieldset>
  );
}

// Flat list of plain strings (kind:"stringArray", e.g. emails / payment labels) — one input per item.
function StringArrayField({
  field,
  value,
  onChange,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const arr = (Array.isArray(value) ? value : []) as string[];
  const setAt = (i: number, text: string) =>
    onChange(arr.map((x, j) => (j === i ? text : x)));
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({arr.length} item{arr.length === 1 ? "" : "s"})
        </span>
      </legend>
      {arr.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={s} onChange={(e) => setAt(i, e.target.value)} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            aria-label={`Remove item ${i + 1}`}
            onClick={() => onChange(arr.filter((_, j) => j !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...arr, ""])}
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </fieldset>
  );
}

// Repeater of object items (kind:"array" with children = the item shape). Each item is a card with
// its child fields rendered by the same FieldEditor; supports add / remove / reorder — except under
// a lens (`partial`), where `children` is a pruned subset of the item shape and so no longer
// describes what a NEW item must contain. See FieldEditorProps.partial.
function ArrayField({
  field,
  value,
  onChange,
  onValidityChange,
  assets,
  onPickMedia,
  onFieldFocus,
  flashField,
  partial,
}: {
  field: FieldPlan;
  value: unknown;
  onChange: (v: unknown) => void;
  onValidityChange: (name: string, valid: boolean) => void;
  assets: FieldAssetRow[];
  onPickMedia?: (fieldName: string, kind: "image" | "video") => void;
  onFieldFocus?: (fieldName: string) => void;
  flashField?: { name: string; nonce: number } | null;
  partial?: boolean;
}) {
  const items = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const children = field.children ?? [];

  const commit = (next: Record<string, unknown>[]) => onChange(next);
  const setItem = (i: number, item: Record<string, unknown>) =>
    commit(items.map((it, j) => (j === i ? item : it)));
  const addItem = () =>
    commit([
      ...items,
      Object.fromEntries(children.map((c) => [c.name, defaultForField(c)])),
    ]);
  const removeItem = (i: number) => commit(items.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-medium text-foreground">
        {field.label}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          ({items.length} item{items.length === 1 ? "" : "s"})
        </span>
      </legend>
      {items.map((item, i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Item {i + 1}
            </span>
            {!partial && (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  aria-label="Move down"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => removeItem(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          {children.map((child) => (
            <FieldEditor
              key={child.name}
              field={{ ...child, name: `${field.name}.${i}.${child.name}` }}
              value={item[child.name]}
              assets={assets}
              onChange={(cv) => setItem(i, { ...item, [child.name]: cv })}
              onValidityChange={onValidityChange}
              onPickMedia={onPickMedia}
              onFieldFocus={onFieldFocus}
              flashField={flashField}
              partial={partial}
            />
          ))}
        </div>
      ))}
      {!partial && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4" />
            Add item
          </Button>
        </div>
      )}
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
  partial,
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
  } else if (field.kind === "color") {
    inner = <ColorField field={field} value={value} onChange={onChange} />;
  } else if (field.kind === "overlay") {
    inner = (
      <OverlayField
        value={value as Overlay | undefined}
        onChange={onChange}
        label={field.label}
        idPrefix={field.name}
      />
    );
  } else if (field.kind === "boolean") {
    inner = <BooleanField field={field} value={value} onChange={onChange} />;
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
  } else if (field.kind === "mediaRef") {
    // A flexible slot (image OR video, @signex/shared MediaRef). No dedicated editor: render
    // whichever of the two existing sub-renderers matches what's CURRENTLY stored, so an
    // image-holding slot shows the image editor and a video-holding slot shows the video editor.
    // Empty/null defaults to the image editor. The full image↔video switch itself happens on the
    // canvas via the visual-editor picker (its flexible toggle) — this sidebar only has to reflect
    // the current kind, not offer the swap.
    const holdsVideo = value != null && isVideoRef(value as MediaRef);
    inner = holdsVideo ? (
      <VideoRefField
        field={field}
        value={value}
        onChange={onChange}
        assets={assets}
        onPickMedia={onPickMedia}
      />
    ) : (
      <AssetRefField
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
        partial={partial}
      />
    );
  } else if (field.kind === "localizedArray") {
    inner = <LocalizedArrayField field={field} value={value} onChange={onChange} />;
  } else if (field.kind === "stringArray") {
    inner = <StringArrayField field={field} value={value} onChange={onChange} />;
  } else if (field.kind === "array") {
    inner = (
      <ArrayField
        field={field}
        value={value}
        onChange={onChange}
        onValidityChange={onValidityChange}
        assets={assets}
        onPickMedia={onPickMedia}
        onFieldFocus={onFieldFocus}
        flashField={flashField}
        partial={partial}
      />
    );
  } else {
    // json (scalar arrays / unmodellable shapes) → raw JSON textarea (parseBlock validates on save)
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
