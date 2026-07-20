"use client";

// app/(dash)/editor/_panels/color-panel.tsx
// The right-hand panel of COLOUR mode. Replaces both halves of the old colour UI: the floating
// colour popover (which anchored to the clicked zone) and the palette rail item (which edited
// the seeds with no idea what they painted). Same shape as ContextPanel — fixed header + ScrollArea
// + <fieldset>/<legend> groups — because the panel is now MODE-dynamic: colour mode swaps this in
// where the section form was, and it has to read as the same surface.
//
// WHAT A CLICK PRODUCES. The user never picks a DOM element. They click; the preview's color-engine
// resolves, per colour ROLE, which element actually PAINTS it (the nav CTA's pill is a `.btn-bg`
// child of a transparent <a>; a heading's text is painted by the section, not by the GSAP split-text
// letter under the pointer), and reports the rendered hex, the seed/token key behind it, and a
// provably-unique selector for it. This panel offers exactly what that resolution found.
//
// TOKEN FIRST. When a role's colour comes from a design token, "đổi cả site" is the DEFAULT action:
// it edits the token, so every element using it follows and the site stays consistent. The
// per-element override is the deliberate escape hatch — mint one and a later brand-colour change
// silently skips this element forever. Both are offered; the order and the copy say which is which.
//
// EVERY EMPTY STATE HERE IS HONEST, NOT AN ERROR:
//   • no tokenKey  → NORMAL. A winning rule that reads a literal colour, or a var in neither
//     PALETTE_VARS nor TOKEN_VARS, gives auto-detection nothing to report — while a classed element
//     still gives buildSelector a unique target. The per-element override is then simply the only
//     path — offered as such, not as a failure. (The old popover used token === "" to HIDE its
//     site-wide mode; this is the same fact, without the pretence.)
//   • no tokenKey + an override already set → says NOTHING about the palette, because it cannot:
//     our own override IS the winning rule, so detectToken is reading us and its silence is not
//     evidence. See RoleRow — this is the one case where absent tokenKey is not a fact about the
//     element.
//   • tokenKey but NOT tokenReaches → the element reads a token that a SECTION re-declares for its
//     own subtree, so a site-wide edit of it repaints everything except this element. Reading a
//     token and following a site-wide change of it are different facts; the panel offers the route
//     only when the preview has measured that it arrives. See RoleRow's `shadowed`.
//   • no hex       → the colour is not expressible as hex AT ALL — a gradient. Alpha no longer
//     qualifies: rgbToHex emits `#rrggbbaa` and tokens/overrides store it. And a missing hex never
//     suppresses a ROUTE — writing an override needs only a selector, never the old value. A role
//     the element does not have at all (no border on a borderless box) is not in `roles` and gets no
//     row — resolveRoles omits it.
//   • no selector  → buildSelector could not PROVE a unique target, so we refuse to anchor. A
//     selector that isn't provably unique is never stored.
//
// ALPHA. Tokens and per-element overrides carry it (`#rrggbbaa`); the SEEDS deliberately do not.
// Every color-mix in the template takes a seed and nothing else, so a seed's alpha would be
// multiplied into each derived shade (0.5 seed → 0.321 through --base--dark-64); a token or an
// override is terminal and renders at exactly the alpha picked. That split is why `alpha` is a
// per-row prop and not a panel-wide mode. See shared's Hex vs HexA.

import * as React from "react";

import { SEED_KEYS, PALETTE_VARS, isInertSeed, Hex, HexA, splitHexAlpha, joinHexAlpha } from "@signex/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  setSeed,
  setTokenColor,
  setOverride,
  clearOverride,
  clearOverrideRole,
  type PaletteWorkingSet,
} from "../_lib/palette-working-set";
import { ROLE_LABEL, tokenLabel, type ColorRole, type ColorTarget, type RoleInfo } from "../_lib/color-target";

// The two storable formats, taken from the schemas that will actually validate the save rather than
// re-typed here — a third copy of the regex is how the panel and the API drift into disagreeing
// about what the user is allowed to type.
//   • isHexOpaque — the SEEDS. They feed every color-mix in the template, so their alpha would be
//     multiplied into each derived shade; they stay `#rgb`/`#rrggbb`. See shared's Hex.
//   • isHexAlpha  — the TOKENS and the per-element OVERRIDES. Terminal values, so alpha means what
//     it says. `#rrggbbaa`. See shared's HexA.
const isHexOpaque = (v: string) => Hex.safeParse(v).success;
const isHexAlpha = (v: string) => HexA.safeParse(v).success;

// Matches the input styling used by _fields/field-editor.tsx so the two panels agree.
// min-w-0 + flex-1: the hex field takes the leftover width in its row and can still shrink below
// its content width, so a narrow rail shrinks the field instead of overflowing the panel.
const INPUT_CLASS =
  "h-9 min-w-0 flex-1 rounded-md border border-input bg-transparent px-3 font-mono text-xs shadow-xs outline-none transition-[color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

// ─── Swatch ───────────────────────────────────────────────────────────────────

/**
 * The native <input type="color"> is laid over a swatch WE render (opacity-0), so the unset state
 * can be drawn honestly (dashed + checkerboard) instead of the browser painting a solid colour we
 * never chose. The input still supplies the OS picker and keyboard focus.
 *
 * WHY NOT AN RGBA PICKER COMPONENT. `<input type="color">` is `#rrggbb` only — it has no alpha
 * channel in any browser — so alpha needs its own control regardless. The choice was between pulling
 * in a colour-picker dependency and pairing the native input with a shadcn Slider we already ship.
 * The pair wins on every axis that matters here: no new dependency, no bundle cost, the OS picker
 * (with its eyedropper) instead of a hand-rolled canvas, real keyboard and screen-reader support from
 * Radix, and it LOOKS like the rest of this panel because it is the rest of this panel. A picker
 * library would have to be restyled to match the surface it replaced.
 *
 * The checkerboard is now permanent rather than the unset state's texture, and it is what makes alpha
 * legible: a translucent colour composited over it reads as translucent, where over the panel's flat
 * background it would read as a lighter opaque colour — the swatch lying about the value it shows,
 * which is the failure this whole panel is written against.
 */
function Swatch({
  value,
  pick,
  label,
  onPick,
}: {
  /** The actual value, possibly translucent; undefined = not set (dashed + bare checkerboard). */
  value: string | undefined;
  /** What the OS picker opens on — always an opaque `#rrggbb`, since the input accepts nothing else. */
  pick: string;
  label: string;
  onPick: (hex: string) => void;
}) {
  const isSet = value !== undefined;
  return (
    <span className="relative inline-block h-9 w-9 shrink-0">
      <span
        aria-hidden
        className={cn(
          "absolute inset-0 overflow-hidden rounded-md border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]",
          isSet ? "border-input" : "border-dashed border-muted-foreground/50",
        )}
      >
        {isSet ? <span className="block h-full w-full" style={{ backgroundColor: value }} /> : null}
      </span>
      <input
        type="color"
        value={pick}
        onChange={(e) => onPick(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

/**
 * STACKED (label above its controls) rather than label-beside-controls. This rail is narrow and
 * resizable, and the colour names are long ("Nút chính — nền (hover)"): side-by-side left the label
 * ~60px, so it clipped mid-word. Stacking gives the label the full width to wrap and the hex field
 * the full width to be readable, and keeps every row the same shape at any panel width.
 *
 * The hex text keeps LOCAL draft state and only commits a VALID hex upward. Committing every
 * keystroke would put "#12" into the palette, which the API's PaletteSchema rejects — 422-ing the
 * whole save-draft batch, including unrelated block edits.
 */
function ColorRow({
  id,
  label,
  value,
  fallbackHint,
  alpha = false,
  onCommit,
  onClear,
}: {
  id: string;
  label: string;
  /** undefined = not overridden. */
  value: string | undefined;
  /** Shown as the hex placeholder when unset, and what the picker opens on. */
  fallbackHint?: string;
  /** May this value carry alpha? True for tokens/overrides (terminal), false for seeds (they feed
   *  color-mix, which would multiply their alpha into every derived shade). Decides BOTH the
   *  validator and whether the alpha slider exists at all. */
  alpha?: boolean;
  onCommit: (hex: string) => void;
  onClear?: () => void;
}) {
  const [draft, setDraft] = React.useState(value ?? "");
  // Re-sync when the value changes from outside this row (reset, another click, save adopt).
  React.useEffect(() => setDraft(value ?? ""), [value]);

  const accepts = alpha ? isHexAlpha : isHexOpaque;
  const invalid = draft !== "" && !accepts(draft);

  // What the controls OPERATE ON: this row's value if set, else the colour the element actually
  // renders (fallbackHint), else black. Distinct from `value`, which stays undefined so the swatch
  // can keep drawing the unset state honestly rather than claim a colour the user never picked.
  const basis = (value ?? fallbackHint ?? "") || undefined;
  const parts = basis ? splitHexAlpha(basis) : undefined;
  const rgb = parts?.rgb ?? "#000000";
  const a = parts?.alpha ?? 1;
  const pct = Math.round(a * 100);

  // Seeds never round-trip through joinHexAlpha: their row has no slider, so `a` is always 1 and it
  // would be a no-op — but routing them past it entirely is what makes "seeds cannot carry alpha" a
  // property of the code rather than of the arithmetic happening to work out.
  const commit = (nextRgb: string, nextAlpha: number) =>
    onCommit(alpha ? joinHexAlpha(nextRgb, nextAlpha) : nextRgb);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Swatch
          value={value}
          pick={rgb}
          label={`${label} — chọn màu`}
          onPick={(hex) => commit(hex, a)}
        />
        <input
          id={id}
          type="text"
          value={draft}
          placeholder={fallbackHint ?? (alpha ? "#rrggbbaa" : "#rrggbb")}
          spellCheck={false}
          // size=1 kills the input's default ~20-character intrinsic width. Radix's ScrollArea
          // viewport wraps content in a display:table element, which sizes to MIN-content — and an
          // input's min-content is its intrinsic width, which it refuses to shrink below. Without
          // this the table grew past the rail (302px content in a 242px panel) and the hex fields
          // ran off the edge; `flex-1` then never engaged because nothing was actually constrained.
          size={1}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            // Committed VERBATIM, not through joinHexAlpha: the user typed a complete value, and
            // re-deriving it from (rgb, alpha) would quietly rewrite `#abc` to `#aabbcc`.
            if (accepts(next)) onCommit(next);
          }}
          onBlur={() => setDraft(value ?? "")}
          className={cn(
            INPUT_CLASS,
            invalid && "border-destructive focus-visible:ring-destructive/40",
          )}
        />
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label={`Đặt lại ${label} về mặc định`}
            disabled={value === undefined}
            onClick={onClear}
          >
            ×
          </Button>
        ) : null}
      </div>
      {alpha ? (
        <div className="flex items-center gap-2">
          <Slider
            value={[pct]}
            min={0}
            max={100}
            step={1}
            aria-label={`${label} — độ đục`}
            onValueChange={([next]) => commit(rgb, next / 100)}
            className="min-w-0 flex-1"
          />
          <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {pct}%
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A brand seed this template declares but no rule ever reads — so overriding it emits, applies, and
 * paints nothing, site-wide. WHICH seeds those are is not decided here: `isInertSeed` carries the
 * fact, and apps/web/app/lib/palette-template.test.mjs holds it to the actual stylesheets. Point a
 * `var()` at one and that test fails; drop it from INERT_SEED_KEYS and the editable row below
 * returns on its own. Nothing in this file names a colour.
 *
 * SHOWN, NOT HIDDEN — the same principle as ReadOnlyRow, and for a stronger reason. Hiding it would
 * be the honest thing only if the key were gone; it is not. accentAqua stays a valid, storable seed
 * and snapshots already carry values for it, so a hidden row means a stored colour that the user
 * cannot see, cannot explain, and cannot reach — invisible state, which is how this swatch became a
 * problem in the first place. A visible dead control that SAYS it is dead answers the question the
 * user actually has ("I set this — why did nothing happen?"). Cost: one non-interactive row.
 *
 * The stored value is rendered, so "Đặt lại toàn bộ màu" is a discoverable way to clear it — which
 * is the only per-seed clear that has ever existed here (no seed row has an × : seeds always resolve
 * to the template default, so there is no unset state for one to produce).
 */
function InertColorRow({ id, label, value }: { id: string; label: string; value: string }) {
  // Per-row, not a constant: INERT_SEED_KEYS is a list, and two rows sharing one id would silently
  // point every aria-describedby at the first row's sentence.
  const reasonId = `${id}-reason`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {/* Deliberately not the <input type="color"> Swatch: there is no picker to open. Dimmed so
            the row reads as inert at a glance, before the sentence below is read. */}
        <span
          aria-hidden
          className="block h-9 w-9 shrink-0 rounded-md border border-dashed border-muted-foreground/50 opacity-50"
          style={{ backgroundColor: value }}
        />
        {/* readOnly, not disabled: a disabled input is skipped by keyboard nav and hidden from most
            screen readers, so the stored value would be unreachable exactly for the users least able
            to get it elsewhere. readOnly keeps it focusable and announced, and still uneditable. */}
        <input
          id={id}
          type="text"
          value={value}
          readOnly
          size={1}
          spellCheck={false}
          aria-describedby={reasonId}
          className={cn(INPUT_CLASS, "cursor-not-allowed text-muted-foreground opacity-70")}
        />
      </div>
      <p id={reasonId} className="text-xs text-muted-foreground">
        Giao diện hiện tại không dùng màu này ở đâu cả — đổi nó sẽ không thay đổi gì trên site.
      </p>
    </div>
  );
}

/** A role we can show but not edit — stated with its reason, so "no control" never reads as a bug. */
function ReadOnlyRow({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </div>
  );
}

// ─── Role row ─────────────────────────────────────────────────────────────────

function RoleRow({
  info,
  tokenValue,
  overrideValue,
  onPickToken,
  onPickElement,
  onClearElement,
}: {
  info: RoleInfo;
  /** The palette's current value for info.tokenKey (seed → always resolves; token → sparse). */
  tokenValue: string | undefined;
  /** The palette's current per-element override for this role on info.selector. */
  overrideValue: string | undefined;
  onPickToken: (hex: string) => void;
  onPickElement: (hex: string) => void;
  onClearElement: () => void;
}) {
  const label = ROLE_LABEL[info.role];

  // No selector → buildSelector could not PROVE a unique target, so we refuse to anchor. This
  // refusal is the load-bearing one and it stays: a selector that isn't provably unique is never
  // stored.
  const canOverride = Boolean(info.selector);

  // A token this element READS is only a site-wide ROUTE if editing it site-wide actually moves this
  // element. 29 section selectors re-declare each tier-B token for their own subtree, which shadows
  // the `:root, html body` rule paletteStyle emits — so for an element inside one, "đổi cả site"
  // repaints the rest of the site and not the thing the user clicked. The preview measures it per
  // click (color-engine's tokenReaches); only a literal false suppresses the route, so a preview that
  // predates the field behaves exactly as before.
  const shadowed = info.tokenKey !== undefined && info.tokenReaches === false;
  const canToken = Boolean(info.tokenKey) && !shadowed;

  // WHAT THIS GUARD USED TO BE, AND WHY THE ORDER IS THE FIX:
  //     if (!info.hex) return <ReadOnlyRow reason="Không đổi được bằng mã hex" />;
  //     const canOverride = Boolean(info.selector);   // ← never reached
  // `info.hex` is the colour the element HAS. A route is what the user may WRITE. Writing an
  // override needs `info.selector` and nothing else — it does not need the old value at all — so
  // refusing on a missing hex refused elements that were perfectly overridable, and it did so with a
  // sentence about hex that named the ENGINE's limitation as if it were the user's dead end. That is
  // exactly what a real user hit on `.tone-medium`: a colour with alpha, unreadable by the old
  // rgbToHex, hence "Không đổi được bằng mã hex", hence nothing to do. Both halves are fixed —
  // rgbToHex reads alpha now — but the ordering was a bug on its own: a gradient is still unreadable,
  // and a gradient-painted element with a selector is still overridable.
  //
  // So the row goes read-only only when there is genuinely NOTHING here: no site-wide route, no
  // per-element route, AND no colour worth showing. With a colour but no route, the box below still
  // renders and quotes it — a fact the user can act on elsewhere is not nothing.
  if (!canToken && !canOverride && !info.hex) {
    return (
      <ReadOnlyRow
        label={label}
        reason={
          shadowed
            ? "Khu vực này tự đặt màu riêng nên đổi màu chung không ảnh hưởng nó, và cũng không xác định được vị trí riêng của phần tử — chưa đổi được từ đây."
            : "Không đọc được màu này bằng mã hex (ví dụ: nền chuyển sắc), và cũng không xác định được vị trí riêng của phần tử — chưa đổi được từ đây."
        }
      />
    );
  }

  // What this role IS right now, best-known. Read through the palette first, not from info.hex:
  // info.hex was measured at CLICK time, and a pick re-themes the preview live without a new click,
  // so quoting it after an edit would show the colour the element no longer has.
  const current = overrideValue ?? tokenValue ?? info.hex;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {current ? (
          <code className="shrink-0 font-mono text-xs text-muted-foreground">{current}</code>
        ) : (
          // No readable colour, but a route exists (or we would not be here) — so the row is live
          // and only the quote is missing. Saying which is better than an empty <code>.
          <span className="shrink-0 text-xs text-muted-foreground">không đọc được</span>
        )}
      </div>

      {canToken && info.tokenKey ? (
        <div className="flex flex-col gap-1.5">
          <ColorRow
            id={`color-token-${info.role}`}
            label={`Đổi cả site — ${tokenLabel(info.tokenKey)}`}
            // A seed always resolves (override ?? template default); a token is sparse, so it falls
            // back to what the element actually renders — which IS what the token resolves to.
            value={tokenValue ?? info.hex}
            // A token is terminal — nothing color-mixes it — so alpha here renders as picked.
            alpha
            onCommit={onPickToken}
          />
          <p className="text-xs text-muted-foreground">
            Mọi phần tử dùng màu này trên toàn site đều đổi theo.
          </p>
        </div>
      ) : null}

      {canOverride ? (
        <div className="flex flex-col gap-1.5">
          <ColorRow
            id={`color-element-${info.role}`}
            label="Chỉ phần tử này"
            // Sparse by design: unset renders dashed/checkered, never a made-up #000000.
            value={overrideValue}
            fallbackHint={info.hex}
            // An override is terminal — it IS the declaration — so alpha renders as picked.
            alpha
            onCommit={onPickElement}
            onClear={onClearElement}
          />
          {/* Four cases now, and each says something the others would get wrong. The `shadowed` one
              is new and it is the reason this element had no honest copy before: the colour IS in
              the palette, so "không thuộc bảng màu chung" would be a lie, but a site-wide edit of it
              would visibly skip this element, so offering that route would be a worse one.
              The `overrideValue` case is the subtle one. Once THIS role carries an override, our own
              rule is the one detectToken reads — so it reports no token for an element that may well
              be token-driven, and did: override the nav CTA's background (btnPrimaryBg), click it
              again, and the old copy told the user this colour was never in the palette while the
              Chữ role beside it still showed its token. An override does not un-token an element; it
              only blinds the detector. So when an override is set we state what we know — this
              element has its own colour — and claim nothing about the palette in either direction. */}
          <p className="text-xs text-muted-foreground">
            {shadowed
              ? "Khu vực này tự đặt màu riêng, nên đổi màu chung không ảnh hưởng nó — chỉ đổi được riêng phần tử này."
              : canToken
                ? "Tách riêng phần tử này khỏi màu chung — đổi màu chung sau này sẽ không còn ảnh hưởng nó."
                : overrideValue !== undefined
                  ? "Phần tử này đang dùng màu riêng. Xoá (×) để nó trở lại màu mặc định."
                  : "Màu này không thuộc bảng màu chung, nên chỉ đổi được riêng phần tử này."}
          </p>
        </div>
      ) : (
        // Every half is reachable and they must say DIFFERENT things. Observed on features.eyebrow:
        // an unclassed text-hook <span> whose colour is declared with a literal hex, so there is no
        // token AND buildSelector can prove no selector — and copy that says "chỉ đổi được cả site"
        // in that case points at a control this row does not have.
        <p className="text-xs text-muted-foreground">
          {canToken
            ? "Không xác định được vị trí riêng của phần tử này, nên chỉ đổi được cả site."
            : shadowed
              ? "Khu vực này tự đặt màu riêng nên đổi màu chung không ảnh hưởng nó, và cũng không xác định được vị trí riêng của phần tử — chưa đổi được từ đây."
              : "Màu này không thuộc bảng màu chung, và cũng không xác định được vị trí riêng của phần tử — chưa đổi được từ đây."}
        </p>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface ColorPanelProps {
  /** The last colour-mode click, as resolved by the preview. Null = nothing clicked yet. */
  target: ColorTarget | null;
  /**
   * The EFFECTIVE palette (saved ∪ unsaved) — a COMPLETE working set, never a patch. The old palette
   * rail panel bound to the unsaved patch, so the moment a save cleared it the panel fell back to the
   * TEMPLATE defaults while the preview correctly rendered the saved colours — the panel disagreeing
   * with the canvas about what colour the site is. See the shell for how the two are kept as one
   * value; the type name says the rest.
   */
  palette: PaletteWorkingSet;
  /** Stored override selectors the preview reports as matching 0 or >1 elements. */
  broken: string[];
  onChange: (next: PaletteWorkingSet) => void;
  /**
   * Distinct from `onChange({})`: a plain merge patch can never DELETE a previously-saved key (see
   * theme.service.ts saveDraft's additive merge), so the reset button needs its own signal.
   */
  onReset: () => void;
}

export function ColorPanel({ target, palette, broken, onChange, onReset }: ColorPanelProps) {
  const overrideFor = (selector: string | undefined, role: ColorRole) =>
    selector ? palette.overrides?.find((o) => o.selector === selector)?.[role] : undefined;

  const tokenValueFor = (tokenKey: string | undefined) => {
    if (!tokenKey) return undefined;
    // A seed always resolves to a real value: the override, else the template default. A token is a
    // SPARSE overlay — unset means "derive from the seeds", which no hex can represent, so it stays
    // undefined and the row falls back to the element's rendered colour.
    if (Object.hasOwn(PALETTE_VARS, tokenKey)) {
      return palette.seeds?.[tokenKey as keyof typeof PALETTE_VARS] ??
        PALETTE_VARS[tokenKey as keyof typeof PALETTE_VARS].default;
    }
    return palette.tokens?.[tokenKey as keyof NonNullable<PaletteWorkingSet["tokens"]>];
  };

  return (
    <div className="flex h-full flex-col">
      {/* Panel header — mirrors ContextPanel's header exactly. */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Màu</h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          {target ? (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <legend className="max-w-full truncate px-1 text-sm font-medium text-foreground" title={target.label}>
                {target.label}
              </legend>
              {target.roles.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Phần tử này không có màu nào đổi được.
                </p>
              ) : (
                target.roles.map((r) => (
                  <RoleRow
                    key={r.role}
                    info={r}
                    tokenValue={tokenValueFor(r.tokenKey)}
                    overrideValue={overrideFor(r.selector, r.role)}
                    // Token first: picking a colour edits the TOKEN so every element using it
                    // follows and the site stays consistent. Minting an override is the deliberate
                    // escape hatch — without this default, changing a brand colour later silently
                    // skips anything hard-overridden.
                    onPickToken={(hex) => onChange(setTokenColor(palette, r.tokenKey!, hex))}
                    onPickElement={(hex) => onChange(setOverride(palette, r.selector!, r.role, hex))}
                    // This ROLE's ×, not this element's: one selector routinely carries several
                    // roles (the same painter answers `bg` and `border` on any element with both),
                    // and clearing the entry would take the siblings with it.
                    onClearElement={() => onChange(clearOverrideRole(palette, r.selector!, r.role))}
                  />
                ))
              )}

              {/* Hover companions. The :hover state cannot be click-resolved (roles are measured from the
                  DEFAULT state's CSSOM), so when the click landed on a primary-button role we offer the two
                  hover TOKENS as extra site-wide rows. Sparse values: unset = template default → checkered. */}
              {target.roles.some((r) => r.tokenKey === "btnPrimaryBg" || r.tokenKey === "btnPrimaryText") && (
                <div className="flex flex-col gap-1.5">
                  <ColorRow
                    id="color-token-hover-bg"
                    label={`Đổi cả site — ${tokenLabel("btnPrimaryHoverBg")}`}
                    value={tokenValueFor("btnPrimaryHoverBg")}
                    alpha
                    onCommit={(hex) => onChange(setTokenColor(palette, "btnPrimaryHoverBg", hex))}
                  />
                  <ColorRow
                    id="color-token-hover-text"
                    label={`Đổi cả site — ${tokenLabel("btnPrimaryHoverText")}`}
                    value={tokenValueFor("btnPrimaryHoverText")}
                    alpha
                    onCommit={(hex) => onChange(setTokenColor(palette, "btnPrimaryHoverText", hex))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Màu khi rê chuột vào nút — áp dụng cho mọi nút chính trên toàn site.
                  </p>
                </div>
              )}
            </fieldset>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Bấm vào một phần tử trên trang để đổi màu.</p>
          )}

          {broken.length > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-lg border border-destructive/50 p-4">
              <legend className="px-1 text-sm font-medium text-destructive">Màu không còn áp dụng</legend>
              <p className="text-xs text-muted-foreground">
                Phần tử gắn màu này không còn trên trang (thường do thêm/bớt mục trong danh sách).
              </p>
              {/* `wrap-anywhere`, and NOT `truncate` — the delete button's reachability rides on it.
                  Radix's ScrollArea viewport wraps content in a display:table box, and a table is
                  shrink-to-fit: its used width can never go below its MIN-CONTENT. `truncate` sets
                  white-space:nowrap, which makes a 100-char selector's min-content the whole ~484px
                  string, so the table grew to 888px inside a 190px panel and the viewport's
                  overflow-x:hidden (Radix leaves it hidden — we mount no horizontal ScrollBar)
                  clipped "Xoá" away entirely: past the viewport edge, elementFromPoint → null, no
                  mouse route to it at all. Tab still reached it (focus scrolls), which is what made
                  a dead control look merely ugly. min-w-0 does NOT fix this, up this chain or any
                  other: min-width is a FLOOR, and a floor of 0 cannot pull a min-content
                  CONTRIBUTION down — only shrinking the content's own min-content can, which is the
                  same trick `size={1}` plays for the hex inputs above. overflow-wrap:anywhere is
                  the one property that does that for text (break-word explicitly does NOT affect
                  min-content), taking it to one character.
                  Wrapping also beats an ellipsis on its own merits: the selectors that collide are
                  siblings sharing a long prefix and differing in the LEAF — `.txt_gone-a` vs
                  `-b` — which is exactly the end an ellipsis eats. The full string is shown, and
                  `title` repeats it for hovering without scrolling. */}
              {broken.map((sel) => (
                // STACKED, and boxed per row — the same two reasons ColorRow stacks. Side-by-side,
                // the button's 51px + gap leaves the selector ~59px in a narrow rail, which wraps a
                // 100-char selector into ~17 lines of 8 characters: reachable, but no longer
                // READABLE, and readable is the entire job of this string. Stacking gives it the
                // rail's full width. The border is not decoration: with two rows and a shared gap,
                // a button sitting under a selector is ambiguous about which one it deletes — and
                // deleting the wrong override is unrecoverable from here.
                <div key={sel} className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
                  <code className="wrap-anywhere font-mono text-xs leading-relaxed" title={sel}>
                    {sel}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-end"
                    onClick={() => onChange(clearOverride(palette, sel))}
                  >
                    Xoá
                  </Button>
                </div>
              ))}
            </fieldset>
          )}

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-medium text-foreground">Màu thương hiệu</legend>
            <p className="text-xs text-muted-foreground">
              Đổi một màu ở đây là đổi trên toàn site — mọi nút, chữ và nền dùng màu đó đều theo.
            </p>
            {SEED_KEYS.map((k) =>
              // A seed always resolves to a real value: the override, else the template default —
              // which is why neither branch has an unset state and neither carries an ×.
              isInertSeed(k) ? (
                <InertColorRow
                  key={k}
                  id={`palette-seed-${k}`}
                  label={PALETTE_VARS[k].label}
                  value={palette.seeds?.[k] ?? PALETTE_VARS[k].default}
                />
              ) : (
                <ColorRow
                  key={k}
                  id={`palette-seed-${k}`}
                  label={PALETTE_VARS[k].label}
                  value={palette.seeds?.[k] ?? PALETTE_VARS[k].default}
                  onCommit={(hex) => onChange(setSeed(palette, k, hex))}
                />
              ),
            )}
          </fieldset>

          <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
            Đặt lại toàn bộ màu
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
