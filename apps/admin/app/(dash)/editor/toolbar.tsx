"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  MonitorIcon,
  TabletIcon,
  SmartphoneIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Locale, DeviceWidth, ToolbarStatus } from "./_lib/blocks";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ToolbarProps {
  themeName: string;
  backHref: string;
  lang: Locale;
  onLangChange: (l: Locale) => void;
  device: DeviceWidth;
  onDeviceChange: (d: DeviceWidth) => void;
  status: ToolbarStatus;
  draftAheadOf: { draftRevision: number; publishedRevision: number } | null;
  canPublish: boolean;
  publishEnabled: boolean;
  saveEnabled: boolean;
  busy: boolean;
  onReload: () => void;
  onDiscard: () => void;
  onSave: () => void;
  onPublish: () => void;
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ToolbarStatus }) {
  if (status.kind === "saving") {
    return (
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
        Saving…
      </span>
    );
  }
  if (status.kind === "unsaved") {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
        Unsaved · {status.count}
      </span>
    );
  }
  // saved
  return (
    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
      Saved · rev{status.revision}
    </span>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const {
    themeName,
    backHref,
    lang,
    onLangChange,
    device,
    onDeviceChange,
    status,
    draftAheadOf,
    canPublish,
    publishEnabled,
    saveEnabled,
    busy,
    onReload,
    onDiscard,
    onSave,
    onPublish,
  } = props;

  const hasUnsaved = status.kind === "unsaved";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        {/* ── Back ─────────────────────────────────────────────────────────── */}
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
          <a href={backHref}>
            <ArrowLeftIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Themes</span>
          </a>
        </Button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* ── Theme name ───────────────────────────────────────────────────── */}
        <span className="max-w-[140px] truncate text-sm font-medium" title={themeName}>
          {themeName}
        </span>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* ── Locale segmented control ─────────────────────────────────────── */}
        <div className="flex items-center rounded-md border border-input bg-background p-0.5">
          <button
            type="button"
            onClick={() => onLangChange("vi")}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium transition-colors",
              lang === "vi"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            VI
          </button>
          <button
            type="button"
            onClick={() => onLangChange("en")}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium transition-colors",
              lang === "en"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            EN
          </button>
        </div>

        {/* ── Device toggle ────────────────────────────────────────────────── */}
        <ToggleGroup
          type="single"
          value={device}
          onValueChange={(v) => {
            if (v) onDeviceChange(v as DeviceWidth);
          }}
          className="gap-0.5"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="desktop" aria-label="Desktop" className="h-7 w-7 p-0">
  <MonitorIcon className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Desktop</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="tablet" aria-label="Tablet" className="h-7 w-7 p-0">
                <TabletIcon className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Tablet (834px)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <ToggleGroupItem value="mobile" aria-label="Mobile" className="h-7 w-7 p-0">
                <SmartphoneIcon className="h-4 w-4" />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>Mobile (430px)</TooltipContent>
          </Tooltip>
        </ToggleGroup>

        {/* ── Spacer ───────────────────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Status pill + draft-ahead note ───────────────────────────────── */}
        <div className="flex flex-col items-end gap-0.5">
          <StatusPill status={status} />
          {draftAheadOf && (
            <span className="text-[10px] text-muted-foreground">
              Draft ahead of published (rev {draftAheadOf.draftRevision} vs{" "}
              {draftAheadOf.publishedRevision})
            </span>
          )}
        </div>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* ── Reload ───────────────────────────────────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onReload}
              aria-label="Reload preview"
            >
              <RefreshCwIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload preview</TooltipContent>
        </Tooltip>

        {/* ── Discard ──────────────────────────────────────────────────────── */}
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasUnsaved}
          onClick={onDiscard}
        >
          Discard
        </Button>

        {/* ── Save draft ───────────────────────────────────────────────────── */}
        <Button
          variant="outline"
          size="sm"
          disabled={!saveEnabled || busy}
          onClick={onSave}
        >
          Save draft
        </Button>

        {/* ── Publish (PUBLISHER only) ──────────────────────────────────────── */}
        {canPublish && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={!publishEnabled || busy}
                className="gap-1"
              >
                Publish ▾
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onPublish}>
                Publish this theme
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </TooltipProvider>
  );
}
