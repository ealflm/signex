"use client";

import { useState } from "react";
import Link from "next/link";
import type { ThemeListItem } from "@/app/lib/themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DuplicateDialog,
  RenameDialog,
  DeleteDialog,
  PublishDialog,
} from "./theme-dialogs";

type ActiveDialog = "duplicate" | "rename" | "delete" | "publish" | null;

interface ThemeCardProps {
  theme: ThemeListItem;
  activeThemeId: string | null;
  canPublish: boolean;
}

export function ThemeCard({ theme, activeThemeId, canPublish }: ThemeCardProps) {
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);

  const isActive = theme.id === activeThemeId;

  return (
    <>
      <Card className="flex flex-col overflow-hidden pt-0">
        {/* Hero-image thumbnail (from the theme's draftSnapshot) */}
        <div className="aspect-[16/9] w-full overflow-hidden border-b border-border bg-muted">
          {theme.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external R2/MinIO host; thumbnail
            <img
              src={theme.heroImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10 text-3xl font-semibold text-muted-foreground/40">
              {theme.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base leading-snug">{theme.name}</CardTitle>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {theme.isLive && <Badge variant="default">Live</Badge>}
              {theme.dirty && (
                <Badge variant="secondary" title="Unsaved changes since last publish">
                  Unsaved
                </Badge>
              )}
              {isActive && <Badge variant="outline">Active</Badge>}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 pb-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Draft rev.</dt>
            <dd className="font-mono tabular-nums">{theme.draftRevision}</dd>

            <dt className="text-muted-foreground">Last published</dt>
            <dd className="font-mono tabular-nums">
              {theme.lastPublishedRevision > 0 ? (
                `r${theme.lastPublishedRevision}`
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>

            <dt className="text-muted-foreground">Updated</dt>
            <dd className="text-xs text-muted-foreground">
              {new Date(theme.updatedAt).toLocaleString()}
            </dd>
          </dl>
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
          {/* Edit — forward link to Plan 3 editor; will 404 until then */}
          <Button asChild variant="outline" size="sm">
            <Link href={`/editor/${theme.id}`}>Edit</Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveDialog("duplicate")}
          >
            Duplicate
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveDialog("rename")}
          >
            Rename
          </Button>

          {/* Publish: PUBLISHER+ only */}
          {canPublish && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveDialog("publish")}
            >
              Publish
            </Button>
          )}

          {/* Delete: PUBLISHER+ only; disabled on live theme with tooltip */}
          {canPublish && (
            theme.isLive ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Wrapper span so tooltip fires on a disabled button */}
                  <span tabIndex={0} className="inline-flex">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="pointer-events-none text-destructive/50"
                      aria-label="Can't delete the live theme"
                    >
                      Delete
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Can&apos;t delete the live theme</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setActiveDialog("delete")}
              >
                Delete
              </Button>
            )
          )}
        </CardFooter>
      </Card>

      {/*
        Dialogs rendered outside the Card so portal correctly escapes stacking context.
        Always mounted (not conditional) so useActionState state persists across open/close.
        Each dialog resets its "processed" ref when it re-opens.
      */}
      <DuplicateDialog
        theme={theme}
        open={activeDialog === "duplicate"}
        onOpenChange={(open) => setActiveDialog(open ? "duplicate" : null)}
      />
      <RenameDialog
        theme={theme}
        open={activeDialog === "rename"}
        onOpenChange={(open) => setActiveDialog(open ? "rename" : null)}
      />
      <DeleteDialog
        theme={theme}
        open={activeDialog === "delete"}
        onOpenChange={(open) => setActiveDialog(open ? "delete" : null)}
      />
      <PublishDialog
        theme={theme}
        open={activeDialog === "publish"}
        onOpenChange={(open) => setActiveDialog(open ? "publish" : null)}
      />
    </>
  );
}
