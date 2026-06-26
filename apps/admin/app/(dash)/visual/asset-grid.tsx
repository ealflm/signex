"use client";

// app/(dash)/visual/asset-grid.tsx
// Selectable, searchable thumbnail grid for the media picker's Library tab. Reuses the visual
// language of the Media page grid (aspect-square cards, token borders) but each card is a real
// <button> with aria-pressed so it's keyboard- and screen-reader-usable. Single click selects;
// double click selects + confirms (onActivate). Filtered to the target's kinds + a filename search.

import { useMemo, useState, useId } from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AssetRow } from "./media-picker-dialog";

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface AssetGridProps {
  assets: AssetRow[];
  kinds: string[]; // e.g. ["IMAGE","SVG"] or ["VIDEO"]
  selectedId: string;
  onSelect: (asset: AssetRow) => void;
  onActivate?: (asset: AssetRow) => void; // double-click, or Enter on an already-selected card
  loading?: boolean; // first asset fetch in flight
  /** Rendered in place of the grid when nothing matches (e.g. an inline dropzone). */
  emptySlot?: React.ReactNode;
}

export function AssetGrid({ assets, kinds, selectedId, onSelect, onActivate, loading, emptySlot }: AssetGridProps) {
  const [q, setQ] = useState("");
  const searchId = useId();

  const matches = useMemo(() => {
    const kindSet = new Set(kinds);
    const needle = q.trim().toLowerCase();
    return assets.filter(
      (a) => kindSet.has(a.kind) && (needle === "" || a.originalName.toLowerCase().includes(needle)),
    );
  }, [assets, kinds, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={searchId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by file name"
          aria-label="Search assets by file name"
          className="pl-9"
        />
      </div>

      {loading && assets.length === 0 ? (
        <ul role="list" aria-label="Loading assets" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="rounded-xl border border-border bg-card p-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="mt-1.5 h-3 w-3/4" />
            </li>
          ))}
        </ul>
      ) : matches.length === 0 ? (
        (emptySlot ?? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {q.trim() ? `No assets match “${q.trim()}”.` : "No assets yet."}
          </p>
        ))
      ) : (
        <ul
          role="list"
          aria-label="Assets"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          {matches.map((a) => {
            const selected = a.id === selectedId;
            const isImage = a.kind !== "VIDEO";
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a)}
                  onDoubleClick={() => onActivate?.(a)}
                  onKeyDown={(e) => {
                    // Enter on an already-selected card confirms (parity with double-click); otherwise
                    // the native button click already selects it.
                    if (e.key === "Enter" && selected) onActivate?.(a);
                  }}
                  aria-pressed={selected}
                  title={a.originalName}
                  className={cn(
                    "group relative flex w-full flex-col gap-1.5 rounded-xl border bg-card p-2 text-left transition-colors duration-150 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary ring-2 ring-primary" : "border-border",
                  )}
                >
                  <div className="aspect-square w-full overflow-hidden rounded-lg bg-muted">
                    {isImage && a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary R2/MinIO origin; no loader
                      <img
                        src={a.url}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
                        {a.kind}
                      </div>
                    )}
                  </div>
                  <p className="truncate text-xs font-medium text-foreground">{a.originalName}</p>
                  <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {a.width != null && a.height != null ? `${a.width}×${a.height}` : ""}
                    {a.width != null && a.bytes ? " · " : ""}
                    {formatBytes(a.bytes)}
                  </p>
                  {selected && (
                    <span
                      className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                      aria-hidden
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
