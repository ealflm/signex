"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { deriveFields } from "@/app/lib/zodform-fields";
import { BLOCK_REGISTRY } from "@signex/shared";
import type { BlockKey } from "@signex/shared";
import { FieldEditor } from "./_fields/field-editor";
import type { FieldAssetRow } from "./_fields/field-editor";
import { BLOCK_LABELS } from "./_lib/blocks";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ContextPanelProps {
  blockKey: BlockKey | null;
  /** Working block data (pending ∪ base) for blockKey. */
  blockData: Record<string, unknown>;
  assets: FieldAssetRow[];
  /** Called with the top-level field name within the block and the new value. */
  onFieldChange: (fieldName: string, value: unknown) => void;
  onPickMedia: (fieldName: string, kind: "image" | "video") => void;
  onValidityChange: (name: string, valid: boolean) => void;
  /** Panel→canvas highlight: an input gained focus (fieldName = full dotted path within the block). */
  onFieldFocus?: (fieldName: string) => void;
  /** Canvas→panel highlight: scroll + ring the field whose dotted name matches `flashField.name`. */
  flashField?: { name: string; nonce: number } | null;
  /** Bumped on every section select → scroll this panel to top + flash it (right-zone half of #2). */
  panelFlash?: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContextPanel({
  blockKey,
  blockData,
  assets,
  onFieldChange,
  onPickMedia,
  onValidityChange,
  onFieldFocus,
  flashField,
  panelFlash,
}: ContextPanelProps): React.ReactElement {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [flashing, setFlashing] = React.useState(false);

  // On each section select (panelFlash bumps): scroll the panel viewport to top + flash the panel.
  React.useEffect(() => {
    if (blockKey === null) return;
    const vp = rootRef.current?.querySelector<HTMLElement>(
      "[data-radix-scroll-area-viewport],[data-slot='scroll-area-viewport']",
    );
    if (vp) vp.scrollTop = 0;
    setFlashing(true);
    const t = window.setTimeout(() => setFlashing(false), 700);
    return () => window.clearTimeout(t);
  }, [blockKey, panelFlash]);

  // Empty state: no block selected
  if (blockKey === null) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Select a section to edit its content.
        </p>
      </div>
    );
  }

  const fields = deriveFields(BLOCK_REGISTRY[blockKey]);
  const label = BLOCK_LABELS[blockKey] ?? blockKey;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-full flex-col transition-shadow duration-300",
        flashing && "ring-2 ring-inset ring-primary/40",
      )}
    >
      {/* Panel header */}
      <div
        className={cn(
          "border-b border-border px-4 py-3 transition-colors duration-300",
          flashing && "bg-primary/10",
        )}
      >
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      </div>

      {/* Field list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 p-4">
          {fields.map((f) => (
            <FieldEditor
              key={f.name}
              field={f}
              value={blockData[f.name]}
              assets={assets}
              onChange={(v) => onFieldChange(f.name, v)}
              onPickMedia={onPickMedia}
              onValidityChange={onValidityChange}
              onFieldFocus={onFieldFocus}
              flashField={flashField}
            />
          ))}
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No editable fields for this section.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
