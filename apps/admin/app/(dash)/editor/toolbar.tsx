"use client";

import * as React from "react";
import {
  ArrowLeftIcon,
  RefreshCwIcon,
  MonitorIcon,
  TabletIcon,
  SmartphoneIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
import { EDIT_MODES, type EditMode } from "./_lib/modes";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ToolbarProps {
  themeName: string;
  backHref: string;
  lang: Locale;
  onLangChange: (l: Locale) => void;
  device: DeviceWidth;
  onDeviceChange: (d: DeviceWidth) => void;
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  status: ToolbarStatus;
  draftAheadOf: { draftRevision: number; publishedRevision: number } | null;
  canPublish: boolean;
  publishEnabled: boolean;
  saveEnabled: boolean;
  busy: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
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
    mode,
    onModeChange,
    status,
    draftAheadOf,
    canPublish,
    publishEnabled,
    saveEnabled,
    busy,
    fullscreen,
    onToggleFullscreen,
    leftCollapsed,
    rightCollapsed,
    onToggleLeft,
    onToggleRight,
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

        {/* ── Mode segmented control ───────────────────────────────────────
            Centred, deliberately NOT grouped with VI/EN + the device icons: those change how you
            VIEW the page, mode changes WHAT YOU EDIT.
            Measured: 425px free at a 1600px window; four labelled buttons ≈ 340px. Below 1280px
            the labels are dropped for icon + tooltip (same treatment as the device toggle) — hence
            the aria-label, which is the only accessible name each button has at those widths. */}
        <div className="flex flex-1 justify-center">
          <div
            role="group"
            aria-label="Chế độ chỉnh sửa"
            className="flex items-center rounded-md border border-input bg-background p-0.5"
          >
            {EDIT_MODES.map((m) => (
              <Tooltip key={m.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={m.label}
                    aria-pressed={mode === m.key}
                    onClick={() => onModeChange(m.key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                      mode === m.key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <m.Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden xl:inline">{m.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{m.label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

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

        {/* ── Collapse / expand the side panels ────────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleLeft}
              aria-label={leftCollapsed ? "Show sections panel" : "Hide sections panel"}
              aria-pressed={!leftCollapsed}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{leftCollapsed ? "Show sections" : "Hide sections"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleRight}
              aria-label={rightCollapsed ? "Show properties panel" : "Hide properties panel"}
              aria-pressed={!rightCollapsed}
            >
              {rightCollapsed ? (
                <PanelRightOpen className="h-4 w-4" />
              ) : (
                <PanelRightClose className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{rightCollapsed ? "Show properties" : "Hide properties"}</TooltipContent>
        </Tooltip>

        {/* ── Full page ────────────────────────────────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onToggleFullscreen}
              aria-label={fullscreen ? "Exit full page" : "Full page"}
              aria-pressed={fullscreen}
            >
              {fullscreen ? (
                <Minimize2Icon className="h-4 w-4" />
              ) : (
                <Maximize2Icon className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{fullscreen ? "Exit full page (Esc)" : "Full page"}</TooltipContent>
        </Tooltip>

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
