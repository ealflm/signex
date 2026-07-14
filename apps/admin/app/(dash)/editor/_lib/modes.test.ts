import { describe, it, expect } from "vitest";
import {
  EDIT_MODES,
  EDIT_MODE_KEYS,
  DEFAULT_MODE,
  MODE_LENS,
  isMediaField,
  isTextField,
  lensFields,
} from "./modes";
// Relative, NOT "@/…": apps/admin/vitest.config.ts sets no resolve.alias, so the @/ path alias
// resolves in the app (tsconfig paths + Next) but not under vitest. Every existing admin test
// imports relatively for this reason. (A type-only "@/…" import inside modes.ts is fine — it is
// erased before esbuild ever has to resolve it.)
import { deriveFields, type FieldPlan } from "../../../lib/zodform-fields";
import { BLOCK_REGISTRY, type BlockKey } from "@signex/shared";

/**
 * The dotted path of every leaf a plan tree renders — the same `${parent}.${child}` walk
 * ObjectField/ArrayField do, so these assertions read as what lands on screen (and, since the path
 * is also the value's address, as what a save writes to).
 */
function leafPaths(fields: FieldPlan[], prefix = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const name = prefix ? `${prefix}.${f.name}` : f.name;
    if (f.children) out.push(...leafPaths(f.children, name));
    else out.push(name);
  }
  return out;
}

const BLOCK_KEYS = Object.keys(BLOCK_REGISTRY) as BlockKey[];

describe("edit modes", () => {
  it("has exactly the four modes, in canvas order", () => {
    expect(EDIT_MODES.map((m) => m.key)).toEqual(["media", "text", "color", "content"]);
  });

  it("opens in Content so the editor behaves as it did before modes", () => {
    expect(DEFAULT_MODE).toBe("content");
  });

  it("labels are Vietnamese and unique", () => {
    const labels = EDIT_MODES.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Màu");
  });

  // ---------------------------------------------------------------------------------------------
  //  The cross-workspace contract. The vocabulary now comes from @signex/shared, so a DRIFTED
  //  spelling is a type error on both sides and cannot reach here. What the type system does NOT
  //  catch is the other half: `as const satisfies readonly { key: EditMode }[]` proves each key IS
  //  a mode, but never that every mode HAS a button. Dropping one from the list below still
  //  typechecks, still passes the three tests above, and simply removes a mode from the toolbar
  //  with no way left to reach it — the same silent failure, one level down.
  // ---------------------------------------------------------------------------------------------

  it("gives every mode in the shared vocabulary exactly one button", () => {
    expect([...EDIT_MODES.map((m) => m.key)].sort()).toEqual([...EDIT_MODE_KEYS].sort());
  });

  it("boots in a mode the shared vocabulary actually contains", () => {
    // A default outside the vocabulary is the one value the overlay's isEditMode guard cannot save
    // us from: it is never posted, so the preview boots to its own default and the toolbar silently
    // disagrees with the canvas from the first frame.
    expect(EDIT_MODE_KEYS as readonly string[]).toContain(DEFAULT_MODE);
  });
});

describe("field classifiers", () => {
  // Probed against the real registry rather than assumed:
  //   hero → titleTop/titleBottom/subtitle are `localized`, image is `assetRef`.
  const heroFields = deriveFields(BLOCK_REGISTRY.hero);

  it("Media mode lists the hero image and no strings", () => {
    const names = heroFields.filter(isMediaField).map((f) => f.name);
    expect(names).toContain("image");
    expect(names).not.toContain("titleTop");
  });

  it("Text mode lists the hero strings and no media", () => {
    const names = heroFields.filter(isTextField).map((f) => f.name);
    expect(names).toContain("titleTop");
    expect(names).not.toContain("image");
  });

  it("every field lands in at most one visual mode", () => {
    for (const f of heroFields) expect(isMediaField(f) && isTextField(f)).toBe(false);
  });

  it("claims no container: they are LEAF predicates — lensFields decides containers", () => {
    // features.cards is `array`, features.title is `object`. Neither predicate claims them: a
    // container is no kind of leaf. This is why they cannot be used as a bare Array.filter over a
    // section's fields — lensFields recurses and keeps a container by its descendants instead.
    const features = deriveFields(BLOCK_REGISTRY.features);
    const containers = features.filter((f) => f.kind === "array" || f.kind === "object");
    expect(containers.length).toBeGreaterThan(0);
    for (const f of containers) {
      expect(isMediaField(f)).toBe(false);
      expect(isTextField(f)).toBe(false);
    }
  });
});

describe("mode lens", () => {
  it("gives Media and Text a filtered form with its own Vietnamese title", () => {
    expect(MODE_LENS.media?.title).toBe("Hình ảnh & video");
    expect(MODE_LENS.text?.title).toBe("Nội dung chữ");
    expect(
      leafPaths(lensFields(deriveFields(BLOCK_REGISTRY.hero), MODE_LENS.media!.keepLeaf)),
    ).toEqual(["image"]);
  });

  it("leaves Content unfiltered, so the form is exactly what it was before modes existed", () => {
    expect(MODE_LENS.content).toBeNull();
  });

  it("leaves Colour unfiltered too — ColorPanel replaces that zone, it does not filter it", () => {
    expect(MODE_LENS.color).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
//  lensFields — the lens RECURSES.
//
//  Spec decision 6 (docs/superpowers/specs/2026-07-14-editor-modes-design.md): the Media/Text panel
//  lists the whole section, "so array items and slider-internal media, which are deliberately not
//  click-editable, still have a route". A top-level-only lens has no such route — and, because this
//  site keeps nearly all its media inside containers, listed nothing at all for the sections that
//  own the most of it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("lensFields", () => {
  const features = deriveFields(BLOCK_REGISTRY.features);

  it("surfaces media that exists ONLY inside a container", () => {
    // The acceptance case. `features` owns the most media on the site and every bit of it is
    // nested, so before recursion Media mode listed nothing here at all.
    expect(leafPaths(lensFields(features, isMediaField))).toEqual([
      "video.media",
      "featured.image",
    ]);
  });

  it("is not alone: three sections' media is nested-only", () => {
    // features/aboutPage/contactPage all had an empty Media panel. Probed, not assumed.
    for (const key of ["features", "aboutPage", "contactPage"] as const) {
      const all = deriveFields(BLOCK_REGISTRY[key]);
      expect(all.filter(isMediaField)).toEqual([]); // nothing at top level …
      expect(leafPaths(lensFields(all, isMediaField)).length).toBeGreaterThan(0); // … but media exists
    }
  });

  it("prunes a surviving container down to the lens's own leaves", () => {
    // features.video is {title, text, media}. Media keeps the container for `media` and must NOT
    // smuggle title/text in with it — the exact worry that motivated excluding containers, now
    // answered by pruning instead of by exclusion.
    const video = lensFields(features, isMediaField).find((f) => f.name === "video");
    expect(video?.children?.map((c) => c.name)).toEqual(["media"]);
  });

  it("drops a container with no matching descendant", () => {
    const names = lensFields(features, isMediaField).map((f) => f.name);
    expect(names).not.toContain("title"); // object {lead, accent} — text only
    expect(names).not.toContain("cta"); // object {label, href} — text only
    expect(names).not.toContain("cards"); // array of {title, desc} — text only
  });

  it("never yields an empty container, in any section, under either lens", () => {
    // An empty shell is a header with nothing under it: it reads as a broken section rather than as
    // an absence. Swept over the whole registry so a new block cannot reintroduce one.
    const noShells = (fs: FieldPlan[]) => {
      for (const f of fs) {
        if (f.kind === "array" || f.kind === "object") {
          expect(f.children?.length ?? 0).toBeGreaterThan(0);
          noShells(f.children!);
        }
      }
    };
    for (const keep of [isMediaField, isTextField]) {
      for (const key of BLOCK_KEYS) noShells(lensFields(deriveFields(BLOCK_REGISTRY[key]), keep));
    }
  });

  it("recurses deeper than one level", () => {
    // The registry is two containers deep today (aboutPage.detail.listTitle.lead) and
    // zodform-fields' MAX_OBJECT_DEPTH allows three. lensFields sets no limit of its own — it
    // recurses as far as the plan goes. Synthetic, so it keeps proving that even if the registry
    // flattens later.
    const tree: FieldPlan[] = [
      {
        name: "a",
        kind: "object",
        label: "a",
        children: [
          {
            name: "b",
            kind: "object",
            label: "b",
            children: [
              {
                name: "c",
                kind: "array",
                label: "c",
                children: [
                  { name: "deep", kind: "assetRef", label: "deep" },
                  { name: "prose", kind: "localized", label: "prose" },
                ],
              },
            ],
          },
        ],
      },
    ];
    expect(leafPaths(lensFields(tree, isMediaField))).toEqual(["a.b.c.deep"]);
    expect(leafPaths(lensFields(tree, isTextField))).toEqual(["a.b.c.prose"]);
  });

  it("keeps `json` out of both lenses at any depth, container and all", () => {
    // Preserved judgement: a raw-JSON textarea is the fallback for shapes with no editor, not a
    // text field. A container holding only one therefore has no matching descendant and goes too.
    const tree: FieldPlan[] = [
      { name: "box", kind: "object", label: "box", children: [{ name: "blob", kind: "json", label: "blob" }] },
    ];
    expect(lensFields(tree, isTextField)).toEqual([]);
    expect(lensFields(tree, isMediaField)).toEqual([]);
  });

  // ─── The main risk: a filtered view must not change what a save produces ───────────────────────

  it("leaves every surviving path exactly where Content mode has it", () => {
    // A value is addressed by its dotted path (ObjectField/ArrayField build `${parent}.${child}`
    // from the plan's `name`s). If the lens renamed or re-parented anything, a nested edit made
    // through Media/Text would write to a different key than the same edit made in Content —
    // silently, and only in the saved payload.
    for (const key of BLOCK_KEYS) {
      const all = deriveFields(BLOCK_REGISTRY[key]);
      const contentPaths = leafPaths(all);
      for (const keep of [isMediaField, isTextField]) {
        const lensed = leafPaths(lensFields(all, keep));
        expect(lensed).toEqual(lensed.filter((p) => contentPaths.includes(p)));
        expect(new Set(lensed).size).toBe(lensed.length); // no path duplicated by the rebuild
      }
    }
  });

  it("is a subsequence of Content's paths — order is preserved, not just membership", () => {
    // The lens only ever removes. Anything else would reshuffle the panel relative to the canvas.
    for (const key of BLOCK_KEYS) {
      const all = deriveFields(BLOCK_REGISTRY[key]);
      const contentPaths = leafPaths(all);
      for (const keep of [isMediaField, isTextField]) {
        const lensed = leafPaths(lensFields(all, keep));
        expect(contentPaths.filter((p) => lensed.includes(p))).toEqual(lensed);
      }
    }
  });

  it("is pure: Content mode reads the same plan after a lens has run over it", () => {
    // ContextPanel derives ONCE and lenses that array; an in-place prune would corrupt the Content
    // form (and every later lens) for the rest of the session.
    const all = deriveFields(BLOCK_REGISTRY.features);
    const before = JSON.stringify(all);
    lensFields(all, isMediaField);
    lensFields(all, isTextField);
    expect(JSON.stringify(all)).toBe(before);
  });
});
