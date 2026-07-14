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
//   • no tokenKey  → NORMAL. hero.titleBottom's winning rule reads --…tone--medium, a var in
//     neither PALETTE_VARS nor TOKEN_VARS, so auto-detection reports none. The per-element
//     override is then simply the only path — offered as such, not as a failure. (The old popover
//     used token === "" to HIDE its site-wide mode; this is the same fact, without the pretence.)
//   • no hex       → the colour has alpha (the template derives most tokens via color-mix) or is a
//     gradient. Hex carries neither, so the row says so instead of showing a colour the element
//     does not have. This is the ONLY thing that sentence may mean: a role the element does not
//     have at all (no border on a borderless box) is not in `roles` and gets no row — resolveRoles
//     omits it. The two used to be one row saying the same words, which is how the nav CTA's
//     background could vanish and still look like a designed read-only state.
//   • no selector  → buildSelector could not PROVE a unique target, so we refuse to anchor. A
//     selector that isn't provably unique is never stored.

import * as React from "react";

import { SEED_KEYS, PALETTE_VARS } from "@signex/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  setSeed,
  setTokenColor,
  setOverride,
  clearOverride,
  clearOverrideRole,
  type PalettePatch,
} from "../_lib/palette-patch";
import { ROLE_LABEL, tokenLabel, type ColorRole, type ColorTarget, type RoleInfo } from "../_lib/color-target";

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isHex = (v: string) => HEX.test(v);

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
 */
function Swatch({
  value,
  label,
  onPick,
}: {
  value: string | undefined;
  label: string;
  onPick: (hex: string) => void;
}) {
  const isSet = value !== undefined;
  return (
    <span className="relative inline-block h-9 w-9 shrink-0">
      <span
        aria-hidden
        className={cn(
          "block h-9 w-9 rounded-md border",
          isSet
            ? "border-input"
            : "border-dashed border-muted-foreground/50 bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]",
        )}
        style={isSet ? { backgroundColor: value } : undefined}
      />
      <input
        type="color"
        value={isSet ? value : "#000000"}
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
  onCommit,
  onClear,
}: {
  id: string;
  label: string;
  /** undefined = not overridden. */
  value: string | undefined;
  /** Shown as the hex placeholder when unset. */
  fallbackHint?: string;
  onCommit: (hex: string) => void;
  onClear?: () => void;
}) {
  const [draft, setDraft] = React.useState(value ?? "");
  // Re-sync when the value changes from outside this row (reset, another click, save adopt).
  React.useEffect(() => setDraft(value ?? ""), [value]);

  const invalid = draft !== "" && !isHex(draft);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Swatch value={value} label={`${label} — chọn màu`} onPick={onCommit} />
        <input
          id={id}
          type="text"
          value={draft}
          placeholder={fallbackHint ?? "#rrggbb"}
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
            if (isHex(next)) onCommit(next);
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

  // No hex → the colour has alpha (the template derives most tokens via color-mix) or is a
  // gradient; hex cannot carry either, so say so rather than show a colour the element doesn't have.
  if (!info.hex) return <ReadOnlyRow label={label} reason="Không đổi được bằng mã hex" />;
  // No selector → buildSelector could not PROVE a unique target, so we refuse to anchor.
  const canOverride = Boolean(info.selector);

  // What this role IS right now, best-known. Read through the palette first, not from info.hex:
  // info.hex was measured at CLICK time, and a pick re-themes the preview live without a new click,
  // so quoting it after an edit would show the colour the element no longer has.
  const current = overrideValue ?? tokenValue ?? info.hex;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <code className="shrink-0 font-mono text-xs text-muted-foreground">{current}</code>
      </div>

      {info.tokenKey ? (
        <div className="flex flex-col gap-1.5">
          <ColorRow
            id={`color-token-${info.role}`}
            label={`Đổi cả site — ${tokenLabel(info.tokenKey)}`}
            // A seed always resolves (override ?? template default); a token is sparse, so it falls
            // back to what the element actually renders — which IS what the token resolves to.
            value={tokenValue ?? info.hex}
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
            onCommit={onPickElement}
            onClear={onClearElement}
          />
          <p className="text-xs text-muted-foreground">
            {info.tokenKey
              ? "Tách riêng phần tử này khỏi màu chung — đổi màu chung sau này sẽ không còn ảnh hưởng nó."
              : "Màu này không thuộc bảng màu chung, nên chỉ đổi được riêng phần tử này."}
          </p>
        </div>
      ) : (
        // Both halves are reachable and they must say DIFFERENT things. Observed on
        // features.eyebrow: an unclassed text-hook <span> whose colour is declared with a literal
        // hex, so there is no token AND buildSelector can prove no selector — and copy that says
        // "chỉ đổi được cả site" in that case points at a control this row does not have.
        <p className="text-xs text-muted-foreground">
          {info.tokenKey
            ? "Không xác định được vị trí riêng của phần tử này, nên chỉ đổi được cả site."
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
   * The EFFECTIVE palette (saved ∪ unsaved), not the unsaved patch. The old palette rail panel bound to
   * the patch, so the moment a save cleared it the panel fell back to the TEMPLATE defaults while
   * the preview correctly rendered the saved colours — the panel disagreeing with the canvas about
   * what colour the site is. See the shell for how the two are kept as one value.
   */
  palette: PalettePatch;
  /** Stored override selectors the preview reports as matching 0 or >1 elements. */
  broken: string[];
  onChange: (next: PalettePatch) => void;
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
    return palette.tokens?.[tokenKey as keyof NonNullable<PalettePatch["tokens"]>];
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
              {broken.map((sel) => (
                <div key={sel} className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-xs" title={sel}>
                    {sel}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
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
            {SEED_KEYS.map((k) => (
              <ColorRow
                key={k}
                id={`palette-seed-${k}`}
                label={PALETTE_VARS[k].label}
                // A seed always resolves to a real value: the override, else the template default.
                value={palette.seeds?.[k] ?? PALETTE_VARS[k].default}
                onCommit={(hex) => onChange(setSeed(palette, k, hex))}
              />
            ))}
          </fieldset>

          <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
            Đặt lại toàn bộ màu
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
