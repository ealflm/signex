"use client";

// app/(dash)/editor/color-popover.tsx
// Colour-zone click popover (Task 10). The preview overlay posts { type:"colorEdit", field, token,
// roles } when an admin clicks a [data-edit-kind="color"] zone (Task 6). This renders a Popover
// anchored near the canvas offering two modes:
//   • "Đổi cả site"      (token mode)   — edit the seed/token behind the zone → site-wide via
//                                         setSeed/setToken (editor-shell branches on PALETTE_VARS).
//   • "Chỉ phần tử này"  (element mode) — per-element override keyed by `field` (the anchorId) +
//                                         role, via setOverride. Element-only (no token mode) when
//                                         `token === ""` — some zones aren't backed by a seed/token.
// Pure presentational: every pick calls back to editor-shell, which live-applies via applyPalette.

import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { TOKEN_VARS, PALETTE_VARS, type TokenKey, type SeedKey } from "@signex/shared";

export type ColorRole = "bg" | "text" | "border";

export interface ColorEditTarget {
  field: string; // anchorId (data-edit-field)
  token: string; // seed/token key, "" if element-only
  roles: ColorRole[];
}

const ROLE_LABEL: Record<ColorRole, string> = { bg: "Nền", text: "Chữ", border: "Viền" };

export function ColorPopover({
  target,
  anchor,
  onPickToken,
  onPickElement,
  onClose,
}: {
  target: ColorEditTarget;
  anchor: { x: number; y: number };
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
        <span style={{ position: "fixed", left: anchor.x, top: anchor.y }} />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        {target.token && (
          <div className="mb-3 flex gap-1">
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
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{tokenLabel}</span>
            <input
              type="color"
              onChange={(e) => onPickToken(target.token, e.target.value)}
              className="h-7 w-9 rounded border"
            />
          </label>
        ) : (
          <div>
            {target.roles.length > 1 && (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ColorRole)}
                className="mb-2 w-full rounded border px-2 py-1 text-sm"
              >
                {target.roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>{target.roles.length > 1 ? ROLE_LABEL[role] : "Màu"}</span>
              <input
                type="color"
                onChange={(e) => onPickElement(target.field, role, e.target.value)}
                className="h-7 w-9 rounded border"
              />
            </label>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
