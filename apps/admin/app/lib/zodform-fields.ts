import { z } from "@signex/shared";

export type FieldKind =
  | "string"
  | "localized"
  | "localizedArray"
  | "array"
  | "assetRef"
  | "json";

export interface FieldPlan {
  name: string;
  kind: FieldKind;
  label: string;
  children?: FieldPlan[]; // for kind:"array" — the shape of one repeater item
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
  return Boolean(shape && "assetId" in shape);
}

function classify(name: string, raw: z.ZodTypeAny): FieldPlan {
  const s = unwrap(raw);
  if (isStringSchema(s)) return { name, kind: "string", label: name };
  if (isLocalizedArray(s)) return { name, kind: "localizedArray", label: name };
  if (isLocalized(s)) return { name, kind: "localized", label: name };
  if (isAssetRef(s)) return { name, kind: "assetRef", label: name };
  if (typeName(s) === "ZodArray") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = unwrap((s as any)._def.type ?? (s as any)._def.element);
    const itemShape = objectShape(element);
    if (itemShape) {
      const children = Object.entries(itemShape).map(([k, v]) =>
        classify(k, v as z.ZodTypeAny)
      );
      return { name, kind: "array", label: name, children };
    }
    // array of scalars — json fallback (raw validated textarea)
    return { name, kind: "json", label: name };
  }
  // nested objects / unions / records / numbers / booleans -> raw JSON textarea
  return { name, kind: "json", label: name };
}

// Walk a top-level block object schema into a flat-ish render plan.
export function deriveFields(schema: z.ZodTypeAny): FieldPlan[] {
  const shape = objectShape(unwrap(schema));
  if (!shape) return [{ name: "__root__", kind: "json", label: "value" }];
  return Object.entries(shape).map(([name, v]) =>
    classify(name, v as z.ZodTypeAny)
  );
}
