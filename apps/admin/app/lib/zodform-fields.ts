import { z } from "@signex/shared";

export type FieldKind =
  | "string"
  | "localized"
  | "localizedArray"
  | "stringArray"
  | "boolean"
  | "array"
  | "assetRef"
  | "videoRef"
  | "mediaRef"
  | "object"
  | "json";

// How deep we recurse into plain (non-special) objects before falling back to a raw-JSON textarea.
// 3 reaches the deepest real leaves in the block registry (e.g. block → fields → name → {label}),
// turning two-tone `{lead,accent}` titles and `formConfig.fields.*` into proper inputs.
const MAX_OBJECT_DEPTH = 3;

export interface FieldPlan {
  name: string;
  kind: FieldKind;
  label: string;
  // for kind:"array" — the shape of one repeater item;
  // for kind:"object" — the (one-level) nested leaf fields, rendered grouped under the parent.
  children?: FieldPlan[];
}

// Strip Optional/Default/Nullable wrappers down to the inner schema.
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema as z.ZodTypeAny;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let def: any = s._def;
  while (
    def?.typeName === "ZodOptional" ||
    def?.typeName === "ZodDefault" ||
    def?.typeName === "ZodNullable"
  ) {
    s = def.innerType ?? def.schema ?? s;
    def = (s as z.ZodTypeAny)._def;
    if (!s) break;
  }
  return s;
}

function typeName(schema: z.ZodTypeAny): string | undefined {
  return (schema as { _def?: { typeName?: string } })._def?.typeName;
}

function isStringSchema(s: z.ZodTypeAny): boolean {
  const tn = typeName(s);
  return tn === "ZodString" || tn === "ZodEnum";
}

// { en: <X>, vi: <X> } detection.
function objectShape(s: z.ZodTypeAny): Record<string, z.ZodTypeAny> | null {
  if (typeName(s) !== "ZodObject") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shape = (s as any)._def.shape;
  return typeof shape === "function" ? shape() : shape;
}

function isLocalized(s: z.ZodTypeAny): boolean {
  const shape = objectShape(s);
  if (!shape) return false;
  const keys = Object.keys(shape);
  return (
    keys.length === 2 &&
    keys.includes("en") &&
    keys.includes("vi") &&
    isStringSchema(unwrap(shape.en)) &&
    isStringSchema(unwrap(shape.vi))
  );
}

function isLocalizedArray(s: z.ZodTypeAny): boolean {
  const shape = objectShape(s);
  if (!shape) return false;
  const keys = Object.keys(shape);
  if (!(keys.length === 2 && keys.includes("en") && keys.includes("vi")))
    return false;
  const enInner = unwrap(shape.en);
  return typeName(enInner) === "ZodArray";
}

function isAssetRef(s: z.ZodTypeAny): boolean {
  const shape = objectShape(s);
  // AssetRef = { assetId, alt? }; VideoRef also has assetId-shaped ids — disambiguate by
  // requiring the literal `assetId` key AND no `mp4AssetId` (the VideoRef discriminator).
  return Boolean(shape && "assetId" in shape && !("mp4AssetId" in shape));
}

// VideoRef = { posterAssetId, mp4AssetId, webmAssetId? } — Webflow background-video triple.
function isVideoRef(s: z.ZodTypeAny): boolean {
  const shape = objectShape(s);
  return Boolean(shape && "posterAssetId" in shape && "mp4AssetId" in shape);
}

// MediaRef = z.union([AssetRef, VideoRef]) (packages/shared/src/content/primitives.ts) — a
// flexible slot that may hold EITHER an image or a video. Zod v3 exposes a union's members via the
// `.options` getter, which is just `_def.options` (verified against the installed zod@3.25 source:
// node_modules/zod/v3/types.js `get options() { return this._def.options; }`) — a plain array of
// the member schemas, so detect it structurally the same way isAssetRef/isVideoRef detect their own
// shapes: exactly two options, one AssetRef-shaped and one VideoRef-shaped (either order).
function isMediaRef(s: z.ZodTypeAny): boolean {
  if (typeName(s) !== "ZodUnion") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = ((s as any)._def.options as z.ZodTypeAny[] | undefined) ?? [];
  if (options.length !== 2) return false;
  const [a, b] = options.map((o) => unwrap(o));
  return (isAssetRef(a) && isVideoRef(b)) || (isAssetRef(b) && isVideoRef(a));
}

// A "plain object" we may recurse into: a ZodObject that is NOT one of the special
// structural shapes (localized / localizedArray / assetRef / videoRef).
function isPlainObject(s: z.ZodTypeAny): boolean {
  if (typeName(s) !== "ZodObject") return false;
  return !(
    isLocalized(s) ||
    isLocalizedArray(s) ||
    isAssetRef(s) ||
    isVideoRef(s)
  );
}

// depth 0 = top-level block field; each nested object adds one. We recurse plain objects up to
// MAX_OBJECT_DEPTH so nested leaves (two-tone {lead,accent} titles, formConfig.fields.*) get proper
// editors; objects nested deeper than that fall back to JSON so the tree can't explode and
// array/union shapes stay JSON-editable.
function classify(name: string, raw: z.ZodTypeAny, depth = 0): FieldPlan {
  const s = unwrap(raw);
  if (isStringSchema(s)) return { name, kind: "string", label: name };
  if (typeName(s) === "ZodBoolean") return { name, kind: "boolean", label: name };
  if (isLocalizedArray(s)) return { name, kind: "localizedArray", label: name };
  if (isLocalized(s)) return { name, kind: "localized", label: name };
  // MediaRef is a z.ZodUnion, so it MUST be caught before the generic "unions stay JSON" fallback
  // at the bottom of this function — otherwise a flexible image-OR-video slot silently degrades to
  // a raw-JSON textarea (see zodform-fields.test.ts).
  if (isMediaRef(s)) return { name, kind: "mediaRef", label: name };
  if (isVideoRef(s)) return { name, kind: "videoRef", label: name };
  if (isAssetRef(s)) return { name, kind: "assetRef", label: name };
  if (typeName(s) === "ZodArray") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = unwrap((s as any)._def.type ?? (s as any)._def.element);
    const itemShape = objectShape(element);
    if (itemShape) {
      const children = Object.entries(itemShape).map(([k, v]) =>
        classify(k, v as z.ZodTypeAny, depth + 1)
      );
      return { name, kind: "array", label: name, children };
    }
    // array of plain strings/enums (e.g. emails, payment labels) → a string-list editor.
    if (isStringSchema(element)) return { name, kind: "stringArray", label: name };
    // array of other scalars (numbers, …) — json fallback (raw validated textarea)
    return { name, kind: "json", label: name };
  }
  // Recurse into a plain object (up to MAX_OBJECT_DEPTH) so nested AssetRef/VideoRef/localized/
  // string leaves — and two-tone `{lead,accent}` titles + `formConfig.fields.*` — get proper
  // editors instead of falling through to a raw-JSON textarea. Bounded so the tree can't explode.
  if (depth < MAX_OBJECT_DEPTH && isPlainObject(s)) {
    const shape = objectShape(s)!;
    const children = Object.entries(shape).map(([k, v]) =>
      classify(k, v as z.ZodTypeAny, depth + 1)
    );
    return { name, kind: "object", label: name, children };
  }
  // nested objects (depth>0) / unions / records / numbers / booleans -> raw JSON textarea
  return { name, kind: "json", label: name };
}

// Walk a top-level block object schema into a render plan (one level of object recursion).
export function deriveFields(schema: z.ZodTypeAny): FieldPlan[] {
  const shape = objectShape(unwrap(schema));
  if (!shape) return [{ name: "__root__", kind: "json", label: "value" }];
  return Object.entries(shape).map(([name, v]) =>
    classify(name, v as z.ZodTypeAny, 0)
  );
}
