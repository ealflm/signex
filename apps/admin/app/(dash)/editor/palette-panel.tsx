"use client";

// app/(dash)/editor/palette-panel.tsx
// "Bảng màu" panel — the palette counterpart to ContextPanel. Renders 8 seed swatch+picker rows,
// a collapsible "Nâng cao (token)" group, and a full reset button. Pure presentational: every
// change is expressed as a PalettePatch reducer result handed back via `onChange` — this component
// never touches the iframe or persistence directly (editor-shell's `applyPalette` does that).

import { SEED_KEYS, PALETTE_VARS, TOKEN_KEYS, TOKEN_VARS } from "@signex/shared";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { PalettePatch } from "./_lib/palette-patch";
import { setSeed, setToken } from "./_lib/palette-patch";

// ─── Swatch row ───────────────────────────────────────────────────────────────

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 rounded border"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border px-2 py-1 font-mono text-xs"
          spellCheck={false}
        />
      </span>
    </label>
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
  const seedVal = (k: keyof typeof PALETTE_VARS) => palette.seeds?.[k] ?? PALETTE_VARS[k].default;
  const tokenVal = (k: keyof typeof TOKEN_VARS) => palette.tokens?.[k] ?? "#000000";

  return (
    <div className="p-3">
      <h3 className="mb-2 text-sm font-semibold">Bảng màu</h3>

      {SEED_KEYS.map((k) => (
        <Swatch
          key={k}
          label={PALETTE_VARS[k].label}
          value={seedVal(k)}
          onChange={(hex) => onChange(setSeed(palette, k, hex))}
        />
      ))}

      <Collapsible className="mt-3">
        <CollapsibleTrigger className="text-sm font-medium">Nâng cao (token)</CollapsibleTrigger>
        <CollapsibleContent>
          {TOKEN_KEYS.map((k) => (
            <Swatch
              key={k}
              label={TOKEN_VARS[k].label}
              value={tokenVal(k)}
              onChange={(hex) => onChange(setToken(palette, k, hex))}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onReset}>
        Đặt lại toàn bộ màu
      </Button>
    </div>
  );
}
