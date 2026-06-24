import { z } from "@signex/shared";

export type FieldKind =
  | "string"
  | "localized"
  | "localizedArray"
  | "array"
  | "assetRef"
  | "videoRef"
  | "object"
  | "json";

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

// depth 0 = top-level block field; depth 1 = one level into a nested object.
// We recurse AT MOST one level (depth 1): nested-nested objects fall back to JSON so the
// editor never produces an unbounded tree and array/union shapes stay JSON-editable.
function classify(name: string, raw: z.ZodTypeAny, depth = 0): FieldPlan {
  const s = unwrap(raw);
  if (isStringSchema(s)) return { name, kind: "string", label: name };
  if (isLocalizedArray(s)) return { name, kind: "localizedArray", label: name };
  if (isLocalized(s)) return { name, kind: "localized", label: name };
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
    // array of scalars — json fallback (raw validated textarea)
    return { name, kind: "json", label: name };
  }
  // Recurse ONE level into a plain object so nested AssetRef/VideoRef/localized/string leaves
  // get proper editors instead of falling through to a raw-JSON textarea. Guard with depth so
  // deeper nesting (and array items, which already pass depth+1) stays JSON — conservative by design.
  if (depth === 0 && isPlainObject(s)) {
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
