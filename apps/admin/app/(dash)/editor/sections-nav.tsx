"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SURFACE_GROUPS } from "./_lib/blocks";
import type { BlockKey } from "@signex/shared";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SectionsNavProps {
  selectedBlockKey: BlockKey | null;
  /** blockKeys present in the pending map — drives the dirty dot (●) */
  dirtyKeys: Set<BlockKey>;
  onSelect: (blockKey: BlockKey) => void;
  /** true when the "Bảng màu" panel (not a block) is the active selection */
  paletteSelected: boolean;
  onSelectPalette: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SectionsNav({
  selectedBlockKey,
  dirtyKeys,
  onSelect,
  paletteSelected,
  onSelectPalette,
}: SectionsNavProps): React.ReactElement {
  return (
    <ScrollArea className="h-full w-full">
      <div className="flex flex-col gap-1 p-2">
        {SURFACE_GROUPS.map((group) => (
          <Collapsible key={group.label} defaultOpen>
            {/* Group header */}
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground [&[data-state=open]>svg]:rotate-0 [&[data-state=closed]>svg]:-rotate-90">
              {group.label}
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 transition-transform duration-200" />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-0.5 flex flex-col gap-0.5 pb-1">
                {group.items.map((item) => {
                  const isSelected = item.blockKey === selectedBlockKey;
                  const isDirty = dirtyKeys.has(item.blockKey);

                  return (
                    <button
                      key={item.blockKey}
                      type="button"
                      onClick={() => onSelect(item.blockKey)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <span className="flex-1 truncate">{item.label}</span>
                      {isDirty && (
                        <span
                          aria-label="unsaved"
                          className={cn(
                            "text-base leading-none",
                            isSelected
                              ? "text-primary-foreground/70"
                              : "text-amber-500",
                          )}
                        >
                          ●
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}

        {/* Palette — not block-driven, sits outside SURFACE_GROUPS */}
        <button
          type="button"
          onClick={onSelectPalette}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
            paletteSelected
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <span className="flex-1 truncate">Bảng màu</span>
        </button>
      </div>
    </ScrollArea>
  );
}
