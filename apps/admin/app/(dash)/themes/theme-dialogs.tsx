"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  duplicateAction,
  renameAction,
  deleteAction,
  publishThemeAction,
  type ThemeActionState,
} from "./actions";
import type { ThemeListItem } from "@/app/lib/themes";

// ── Shared helpers ────────────────────────────────────────────────────────────

const EMPTY: ThemeActionState = {};

function InlineError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      aria-live="assertive"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/**
 * Fires a toast + closes the dialog exactly once per successful action.
 * Resets when the dialog re-opens so a subsequent action can toast again.
 */
function useSuccessEffect(
  success: boolean | undefined,
  open: boolean,
  onOpenChange: (open: boolean) => void,
  message: string,
) {
  const processedRef = useRef(false);

  useEffect(() => {
    if (open) processedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (success && !processedRef.current) {
      processedRef.current = true;
      onOpenChange(false);
      toast.success(message);
    }
  }, [success, message, onOpenChange]);
}

// ── NewThemeButton (header action) ──────────────────────────────────────────────
// A new theme can't be blank (every theme must satisfy the 12-block snapshot invariant),
// so "New theme" creates a copy of an existing theme (defaulting to the live one) under a
// new name — then it's editable/publishable independently. Reuses duplicateAction.

export function NewThemeButton({ themes }: { themes: ThemeListItem[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(duplicateAction, EMPTY);

  useSuccessEffect(state.success, open, setOpen, "Theme created.");

  const defaultSource =
    themes.find((t) => t.isLive)?.id ?? themes[0]?.id ?? "";

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={themes.length === 0}>
        <Plus className="size-4" />
        New theme
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New theme</DialogTitle>
            <DialogDescription>
              A new theme starts as a copy of an existing one, then you edit and
              publish it independently.
            </DialogDescription>
          </DialogHeader>

          {state.error && <InlineError message={state.error} />}

          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                name="name"
                defaultValue="New theme"
                required
                autoFocus
                disabled={pending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-source">Copy from</Label>
              <select
                id="new-source"
                name="sourceId"
                defaultValue={defaultSource}
                disabled={pending}
                className={cn(
                  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs",
                  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isLive ? " (live)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={pending}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create theme"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── DuplicateDialog ───────────────────────────────────────────────────────────

interface DuplicateDialogProps {
  theme: ThemeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateDialog({ theme, open, onOpenChange }: DuplicateDialogProps) {
  const [state, formAction, pending] = useActionState(duplicateAction, EMPTY);

  useSuccessEffect(state.success, open, onOpenChange, "Theme duplicated.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate theme</DialogTitle>
          <DialogDescription>
            Create a copy of <strong className="text-foreground">{theme.name}</strong> as a new draft.
          </DialogDescription>
        </DialogHeader>

        {state.error && <InlineError message={state.error} />}

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="sourceId" value={theme.id} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dup-name">Name</Label>
            <Input
              id="dup-name"
              name="name"
              defaultValue={`${theme.name} copy`}
              required
              autoFocus
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Duplicating…" : "Duplicate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── RenameDialog ──────────────────────────────────────────────────────────────

interface RenameDialogProps {
  theme: ThemeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameDialog({ theme, open, onOpenChange }: RenameDialogProps) {
  const [state, formAction, pending] = useActionState(renameAction, EMPTY);

  useSuccessEffect(state.success, open, onOpenChange, "Theme renamed.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename theme</DialogTitle>
          <DialogDescription>
            Change the display name of <strong className="text-foreground">{theme.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {state.error && <InlineError message={state.error} />}

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={theme.id} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ren-name">Name</Label>
            <Input
              id="ren-name"
              name="name"
              defaultValue={theme.name}
              required
              autoFocus
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── DeleteDialog ──────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  theme: ThemeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDialog({ theme, open, onOpenChange }: DeleteDialogProps) {
  const [state, formAction, pending] = useActionState(deleteAction, EMPTY);

  useSuccessEffect(state.success, open, onOpenChange, "Theme deleted.");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{theme.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This theme will be permanently removed. Release history is preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.error && <InlineError message={state.error} />}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* form display:contents so the button participates in the footer flex row */}
          <form action={formAction} className="contents">
            <input type="hidden" name="id" value={theme.id} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── PublishDialog ─────────────────────────────────────────────────────────────

interface PublishDialogProps {
  theme: ThemeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PublishDialog({ theme, open, onOpenChange }: PublishDialogProps) {
  const [state, formAction, pending] = useActionState(publishThemeAction, EMPTY);

  useSuccessEffect(state.success, open, onOpenChange, "Published — now live.");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish {theme.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Visitors will see{" "}
            <strong className="text-foreground">{theme.name}</strong>. The
            current live theme stays saved as a draft.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {state.error && <InlineError message={state.error} />}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <form action={formAction} className="contents">
            <input type="hidden" name="themeId" value={theme.id} />
            <input
              type="hidden"
              name="expectedDraftRevision"
              value={theme.draftRevision}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Publishing…" : "Publish"}
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
