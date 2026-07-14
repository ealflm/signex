"use client";

// app/(dash)/editor/palette-panel.tsx
// "Bảng màu" panel — the palette counterpart to ContextPanel, and deliberately built to the SAME
// shape: fixed header + ScrollArea + <fieldset>/<legend> field groups (see context-panel.tsx and
// _fields/field-editor.tsx), so it reads as part of the editor rather than a bolted-on surface.
//
// Pure presentational: every change is expressed as a PalettePatch reducer result handed back via
// `onChange` — this component never touches the iframe or persistence directly (editor-shell's
// `applyPalette` does that).
//
// Two honesty rules drive the design here:
//   • SEEDS always have a real template default (PALETTE_VARS[k].default), so an un-overridden seed
//     shows that default — true, not a guess.
//   • TOKENS are a SPARSE overlay: un-overridden means "derive from the seeds". Most derive from an
//     ALPHA-scaled seed (color-mix(… N%, transparent)), which an <input type="color"> cannot
//     represent — so we never invent a value. An unset token renders as visibly unset
//     ("Theo mặc định" + a dashed/checkered swatch) instead of claiming to be #000000.

import * as React from "react";

import { SEED_KEYS, PALETTE_VARS, TOKEN_KEYS, TOKEN_VARS } from "@signex/shared";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { PalettePatch } from "./_lib/palette-patch";
import { setSeed, setToken } from "./_lib/palette-patch";

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
  // Re-sync when the value changes from outside this row (reset, popover edit, save adopt).
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

// ─── Panel ────────────────────────────────────────────────────────────────────

export interface PalettePanelProps {
  palette: PalettePatch;
  onChange: (next: PalettePatch) => void;
  /**
   * Distinct from `onChange(resetAll())`: a plain merge patch can never DELETE a previously-saved
   * key (see theme.service.ts saveDraft's additive merge), so the reset button needs its own signal
   * — editor-shell wires this to flag the next save as a full `replacePalette` instead of a merge.
   */
  onReset: () => void;
}

export function PalettePanel({ palette, onChange, onReset }: PalettePanelProps) {
  const clearToken = (k: keyof typeof TOKEN_VARS) => {
    const nextTokens = { ...(palette.tokens ?? {}) };
    delete nextTokens[k];
    onChange({ ...palette, tokens: nextTokens });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Panel header — mirrors ContextPanel's header exactly. */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Bảng màu</h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
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

          <Collapsible>
            <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <legend className="px-1">
                <CollapsibleTrigger className="group flex items-center gap-1.5 rounded-sm text-sm font-medium text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-3.5 shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  Nâng cao (token)
                </CollapsibleTrigger>
              </legend>
              <CollapsibleContent className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Chưa đặt thì token tự suy ra từ màu thương hiệu ở trên. Chỉ đặt khi bạn muốn tách
                  riêng một chỗ.
                </p>
                {TOKEN_KEYS.map((k) => (
                  <ColorRow
                    key={k}
                    id={`palette-token-${k}`}
                    label={TOKEN_VARS[k].label}
                    // Sparse by design: undefined renders as "unset", never as a made-up #000000.
                    value={palette.tokens?.[k]}
                    // Short enough to survive the narrow rail — "Theo mặc định" ellipsized to
                    // "Theo mặc…", which reads as broken rather than as a placeholder.
                    fallbackHint="Mặc định"
                    onCommit={(hex) => onChange(setToken(palette, k, hex))}
                    onClear={() => clearToken(k)}
                  />
                ))}
              </CollapsibleContent>
            </fieldset>
          </Collapsible>

          <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
            Đặt lại toàn bộ màu
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}
