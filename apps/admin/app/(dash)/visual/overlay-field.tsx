"use client";

// app/(dash)/visual/overlay-field.tsx
//
// A reusable "Lớp phủ" (overlay) editor control: None/solid/gradient toggle + colour + opacity +
// gradient angle/stops, with a live preview swatch. Purely presentational — `value` in, `onChange`
// out, no internal state and no persistence of its own. Relocated verbatim (behaviour-preserving)
// out of media-picker-dialog.tsx's FlexibleBody, which owned this control inline; FlexibleBody now
// renders this component and keeps its own `overlay` state + `onOverlayPreview` live-preview wiring
// at the call site. Every `onChange` call is passed a schema-valid `Overlay | undefined` — this
// component never calls any validity/save callback itself, only `onChange`.
import { overlayCss, type Overlay } from "@signex/shared";
// FlexibleBody aliases setKind→setOverlayKind (it has its own image/video `setKind`); this file
// has no such clash, so import it under its own name.
import { setKind as setOverlayKind, addStop, removeStop } from "./overlay-edit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A small preview swatch for the "Lớp phủ" section: a checkerboard backdrop (color-panel.tsx's
// Swatch recipe — `bg-[repeating-conic-gradient(…)]`) so a translucent fill reads as translucent,
// not as a lighter opaque colour sitting on the panel's flat background. The inner div is styled
// by overlayCss — the SAME resolver the public site and the live preview use — so what this box
// shows is exactly what the overlay will render as, "Không" included (overlayCss(undefined) = {},
// i.e. bare checkerboard).
function OverlayPreview({ overlay }: { overlay: Overlay | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Xem trước</span>
      <div
        aria-hidden
        className="relative h-16 w-full overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]"
      >
        <div className="absolute inset-0" style={overlayCss(overlay)} />
      </div>
    </div>
  );
}

interface OverlayFieldProps {
  value: Overlay | undefined;
  onChange: (next: Overlay | undefined) => void;
  label?: string;
}

export function OverlayField({ value, onChange, label = "Lớp phủ" }: OverlayFieldProps) {
  return (
    <div className="mx-6 mb-3 flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <div
          role="group"
          aria-label={`${label} — lớp phủ`}
          className="inline-flex items-center rounded-md border border-input bg-background p-0.5"
        >
          <button
            type="button"
            aria-pressed={value === undefined}
            onClick={() => {
              const next = setOverlayKind(value, "none");
              onChange(next);
            }}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              value === undefined
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Không
          </button>
          <button
            type="button"
            aria-pressed={value?.kind === "solid"}
            onClick={() => {
              const next = setOverlayKind(value, "solid");
              onChange(next);
            }}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              value?.kind === "solid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Màu đặc
          </button>
          <button
            type="button"
            aria-pressed={value?.kind === "gradient"}
            onClick={() => {
              const next = setOverlayKind(value, "gradient");
              onChange(next);
            }}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              value?.kind === "gradient"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Gradient
          </button>
        </div>
      </div>

      {value?.kind === "solid" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value.fill.color}
            onChange={(e) => {
              if (value?.kind !== "solid") return;
              const next: Overlay = { ...value, fill: { ...value.fill, color: e.target.value } };
              onChange(next);
            }}
            aria-label={`${label} — màu lớp phủ`}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
          />
          <span className="shrink-0 text-xs text-muted-foreground">Độ mờ</span>
          <input
            type="range"
            min={0}
            max={100}
            value={value.fill.opacity}
            onChange={(e) => {
              if (value?.kind !== "solid") return;
              const next: Overlay = {
                ...value,
                fill: { ...value.fill, opacity: Number(e.target.value) },
              };
              onChange(next);
            }}
            aria-label={`${label} — độ mờ lớp phủ`}
            className="min-w-0 flex-1"
          />
          <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {value.fill.opacity}%
          </span>
        </div>
      )}

      {value?.kind === "gradient" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Góc</span>
            <input
              type="range"
              min={0}
              max={360}
              value={value.angle}
              onChange={(e) => {
                if (value?.kind !== "gradient") return;
                const next: Overlay = { ...value, angle: Number(e.target.value) };
                onChange(next);
              }}
              aria-label={`${label} — góc gradient`}
              className="min-w-0 flex-1"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {value.angle}°
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {value.stops.map((stop, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border border-border/60 p-2"
              >
                <input
                  type="color"
                  value={stop.color}
                  onChange={(e) => {
                    if (value?.kind !== "gradient") return;
                    const next: Overlay = {
                      ...value,
                      stops: value.stops.map((s, idx) =>
                        idx === i ? { ...s, color: e.target.value } : s,
                      ),
                    };
                    onChange(next);
                  }}
                  aria-label={`${label} — màu điểm dừng ${i + 1}`}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-input p-0.5"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-9 shrink-0 text-[11px] text-muted-foreground">Độ mờ</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={stop.opacity}
                      onChange={(e) => {
                        if (value?.kind !== "gradient") return;
                        const next: Overlay = {
                          ...value,
                          stops: value.stops.map((s, idx) =>
                            idx === i ? { ...s, opacity: Number(e.target.value) } : s,
                          ),
                        };
                        onChange(next);
                      }}
                      aria-label={`${label} — độ mờ điểm dừng ${i + 1}`}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {stop.opacity}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-9 shrink-0 text-[11px] text-muted-foreground">Vị trí</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={stop.pos}
                      onChange={(e) => {
                        if (value?.kind !== "gradient") return;
                        const next: Overlay = {
                          ...value,
                          stops: value.stops.map((s, idx) =>
                            idx === i ? { ...s, pos: Number(e.target.value) } : s,
                          ),
                        };
                        onChange(next);
                      }}
                      aria-label={`${label} — vị trí điểm dừng ${i + 1}`}
                      className="min-w-0 flex-1"
                    />
                    <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {stop.pos}%
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={value.stops.length <= 2}
                  onClick={() => {
                    const next = removeStop(value, i);
                    onChange(next);
                  }}
                  aria-label={`${label} — xoá điểm dừng ${i + 1}`}
                  className="shrink-0 text-muted-foreground"
                >
                  Xoá
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.stops.length >= 4}
            onClick={() => {
              const next = addStop(value);
              onChange(next);
            }}
            className="self-start"
          >
            + Thêm điểm
          </Button>
        </div>
      )}

      <OverlayPreview overlay={value} />
    </div>
  );
}
