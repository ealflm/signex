"use client";

// app/(dash)/editor/color-popover.tsx
// Colour-zone click popover. The preview overlay posts { type:"colorEdit", field, token, roles, rect }
// when an admin clicks a [data-edit-kind="color"] zone. This renders a Popover offering two modes:
//   • "Đổi cả site"      (token mode)   — edit the seed/token behind the zone → site-wide via
//                                         setSeed/setToken (editor-shell branches on PALETTE_VARS).
//   • "Chỉ phần tử này"  (element mode) — per-element override keyed by `field` (the anchorId) +
//                                         role, via setOverride. Element-only (no token mode) when
//                                         `token === ""` — some zones aren't backed by a seed/token.
// Pure presentational: every pick calls back to editor-shell, which live-applies via applyPalette.
//
// ANCHORING: the trigger is an invisible, fixed-position box matching the CLICKED ELEMENT's rect
// (already translated into admin-viewport coords by editor-shell). Giving Radix the real box — not a
// zero-size point at a fixed corner — lets its own collision handling seat the panel beside the
// element and flip/shift when space is tight, so it never covers the thing you're recolouring.

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOKEN_VARS, PALETTE_VARS, type TokenKey, type SeedKey } from "@signex/shared";

export type ColorRole = "bg" | "text" | "border";

export interface ColorEditTarget {
  field: string; // anchorId (data-edit-field)
  token: string; // seed/token key, "" if element-only
  roles: ColorRole[];
  /** The clicked zone's box in ADMIN viewport coords (editor-shell adds the iframe offset). */
  rect: { x: number; y: number; width: number; height: number };
  /**
   * The zone's RENDERED colour per role, read from the preview's computed style. Most tokens are
   * unset in the palette (they derive from a seed), so the stored value can't say what the element
   * currently looks like — this can. Absent for a role the template derives with alpha, which hex
   * cannot represent.
   */
  computed: Partial<Record<ColorRole, string>>;
}

const ROLE_LABEL: Record<ColorRole, string> = { bg: "Nền", text: "Chữ", border: "Viền" };

/**
 * Shows the CURRENT colour and picks a new one.
 *
 * `value` is the stored override (undefined = not overridden) and `current` is what the element
 * actually renders. We paint `value ?? current`: an un-overridden token still shows the real colour,
 * because "what is this now?" is the question the popover exists to answer, and it's also the right
 * starting point for the picker. Only when BOTH are absent (an alpha-derived colour hex can't hold)
 * do we fall back to the dashed/checkered "unset" treatment rather than invent a value.
 */
function Swatch({
  value,
  current,
  label,
  onPick,
}: {
  value: string | undefined;
  current: string | undefined;
  label: string;
  onPick: (hex: string) => void;
}) {
  const shown = value ?? current;
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-xs text-muted-foreground">{shown ?? "—"}</span>
      <span className="relative inline-block h-8 w-8 shrink-0">
        <span
          aria-hidden
          className={cn(
            "block h-8 w-8 rounded-md border",
            shown
              ? "border-input"
              : "border-dashed border-muted-foreground/50 bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]",
          )}
          style={shown ? { backgroundColor: shown } : undefined}
        />
        <input
          type="color"
          value={shown ?? "#000000"}
          onChange={(e) => onPick(e.target.value)}
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
    </span>
  );
}

export function ColorPopover({
  target,
  tokenValue,
  elementValueFor,
  onPickToken,
  onPickElement,
  onClose,
}: {
  target: ColorEditTarget;
  /** Current value behind `target.token` (seed default or token override); undefined = unset. */
  tokenValue: string | undefined;
  /** Current per-element override for a role; undefined = unset. */
  elementValueFor: (role: ColorRole) => string | undefined;
  onPickToken: (tokenKey: string, hex: string) => void;
  onPickElement: (anchorId: string, role: ColorRole, hex: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"token" | "element">(target.token ? "token" : "element");
  const [role, setRole] = useState<ColorRole>(target.roles[0] ?? "bg");
  const tokenLabel =
    TOKEN_VARS[target.token as TokenKey]?.label ??
    PALETTE_VARS[target.token as SeedKey]?.label ??
    target.token;

  return (
    <Popover open onOpenChange={(o) => !o && onClose()}>
      <PopoverTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: target.rect.x,
            top: target.rect.y,
            width: target.rect.width,
            height: target.rect.height,
            pointerEvents: "none",
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        // "bottom", not "right": several zones are full-bleed (the footer bar, the hero title), and
        // a right-side panel has nowhere to go beside them — Radix would collision-shift it back
        // ON TOP of the element being recoloured. Dropping below (flipping above at the viewport
        // edge) clears the element for every zone, and matches how a menu behaves anyway.
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-72"
        // The click that opened this came from inside the iframe; don't yank focus off the canvas.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="mb-3 truncate text-xs text-muted-foreground" title={target.field}>
          {target.field}
        </p>

        {target.token && (
          <div className="mb-3 grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant={mode === "token" ? "default" : "outline"}
              onClick={() => setMode("token")}
            >
              Đổi cả site
            </Button>
            <Button
              size="sm"
              variant={mode === "element" ? "default" : "outline"}
              onClick={() => setMode("element")}
            >
              Chỉ phần tử này
            </Button>
          </div>
        )}

        {mode === "token" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-sm">{tokenLabel}</span>
              <Swatch
                value={tokenValue}
                // The token drives this zone's primary role, so the zone's rendered colour for that
                // role IS what the token currently resolves to.
                current={target.computed[target.roles[0] ?? "bg"]}
                label={tokenLabel}
                onPick={(hex) => onPickToken(target.token, hex)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Áp dụng cho mọi phần tử dùng màu này trên toàn site.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {target.roles.length > 1 && (
              <div className="grid grid-cols-3 gap-1" role="group" aria-label="Chọn vai trò màu">
                {/* Same default/outline treatment as the mode row above — these are two stacked
                    segmented controls, so they should mark "active" the same way. Earlier passes
                    used ghost (the roles rendered as bare text, reading as a caption rather than a
                    choice) then secondary (in dark mode its fill sits so close to the popover
                    surface that the UNSELECTED outlined role drew more attention than the selected
                    one). Blue selected + outlined rest is unambiguous in both themes. */}
                {target.roles.map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    variant={role === r ? "default" : "outline"}
                    aria-pressed={role === r}
                    onClick={() => setRole(r)}
                  >
                    {ROLE_LABEL[r]}
                  </Button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-sm">{ROLE_LABEL[role]}</span>
              <Swatch
                value={elementValueFor(role)}
                current={target.computed[role]}
                label={`${ROLE_LABEL[role]} — chỉ phần tử này`}
                onPick={(hex) => onPickElement(target.field, role, hex)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Chỉ đổi riêng phần tử này, không ảnh hưởng chỗ khác.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
