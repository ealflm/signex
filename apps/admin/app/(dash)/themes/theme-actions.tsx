"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import type { ThemeListItem } from "@/app/lib/themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DuplicateDialog,
  RenameDialog,
  DeleteDialog,
  PublishDialog,
} from "./theme-dialogs";

type ActiveDialog = "duplicate" | "rename" | "delete" | "publish" | null;

interface ThemeActionsProps {
  theme: ThemeListItem;
  /** PUBLISHER+ — gates Publish + Delete. */
  canPublish: boolean;
  /** Absolute URL of the public site (for "View live" on the live theme). */
  liveSiteUrl: string;
  /** "live" = the published-spotlight layout; "draft" = a grid card. */
  variant: "live" | "draft";
}

/**
 * The action cluster shared by the live spotlight and the draft cards:
 * Edit (primary) + a contextual Publish / View-live + an overflow menu for the
 * secondary verbs. Owns the dialog open-state so both layouts wire identically.
 */
export function ThemeActions({
  theme,
  canPublish,
  liveSiteUrl,
  variant,
}: ThemeActionsProps) {
  const [dialog, setDialog] = useState<ActiveDialog>(null);

  const isLive = theme.isLive;
  // Publishing a clean live theme is a no-op, so only offer Publish when it
  // would change what visitors see: any draft, or the live theme with edits.
  const showPublish = canPublish && (!isLive || theme.dirty);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm">
          <Link href={`/editor/${theme.id}`}>Edit</Link>
        </Button>

        {variant === "live" && (
          <Button asChild variant="outline" size="sm">
            <a href={liveSiteUrl} target="_blank" rel="noopener noreferrer">
              View live
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        )}

        {showPublish && (
          <Button variant="outline" size="sm" onClick={() => setDialog("publish")}>
            {isLive ? "Publish changes" : "Publish"}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="More actions"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog("rename")}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            {/* The live theme can't be deleted — there'd be nothing to serve. */}
            {!isLive && canPublish && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setDialog("delete")}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DuplicateDialog
        theme={theme}
        open={dialog === "duplicate"}
        onOpenChange={(open) => setDialog(open ? "duplicate" : null)}
      />
      <RenameDialog
        theme={theme}
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
      />
      {!isLive && (
        <DeleteDialog
          theme={theme}
          open={dialog === "delete"}
          onOpenChange={(open) => setDialog(open ? "delete" : null)}
        />
      )}
      {showPublish && (
        <PublishDialog
          theme={theme}
          open={dialog === "publish"}
          onOpenChange={(open) => setDialog(open ? "publish" : null)}
        />
      )}
    </>
  );
}
