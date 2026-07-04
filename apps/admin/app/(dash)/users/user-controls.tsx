"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, UserX, UserCheck } from "lucide-react";
import type { RoleName } from "@signex/shared";
import { updateUserRole, deactivateUser, reactivateUser } from "./actions";
import { deactivateBlockReason } from "./user-policy";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ROLE_LABEL: Record<RoleName, string> = {
  EDITOR: "Editor",
  PUBLISHER: "Publisher",
  ADMIN: "Admin",
};
const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

/**
 * Per-row controls for a user: a single ⋯ menu that changes the role (a radio group — pick saves
 * immediately) and deactivates the account (guarded by an AlertDialog confirm, not window.confirm).
 * Both call the existing server actions; revalidatePath('/users') refreshes the row.
 */
export function UserRowMenu({
  userId,
  username,
  role,
  isActive,
  isSelf,
  isLastActiveAdmin,
}: {
  userId: string;
  username: string;
  role: RoleName;
  isActive: boolean;
  isSelf: boolean;
  isLastActiveAdmin: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Mirror of the api guards: a blocked Deactivate is shown disabled (with the reason) rather
  // than hidden, so it's clear WHY it's unavailable. The api re-checks regardless.
  const blockReason = deactivateBlockReason({ isSelf, lastActiveAdmin: isLastActiveAdmin });

  function changeRole(next: string) {
    if (next === role) return;
    const fd = new FormData();
    fd.set("id", userId);
    fd.set("role", next);
    startTransition(() => {
      void updateUserRole(fd);
    });
  }

  function deactivate() {
    const fd = new FormData();
    fd.set("id", userId);
    startTransition(() => {
      void deactivateUser(fd);
    });
    setConfirmOpen(false);
  }

  function reactivate() {
    const fd = new FormData();
    fd.set("id", userId);
    startTransition(() => {
      void reactivateUser(fd);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={`Actions for ${username}`}
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Role
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={role} onValueChange={changeRole}>
            {ROLES.map((r) => (
              <DropdownMenuRadioItem
                key={r}
                value={r}
                // Can't demote the last active admin — that would strand the site with no admin.
                disabled={isLastActiveAdmin && r !== "ADMIN"}
              >
                {ROLE_LABEL[r]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {isActive ? (
            blockReason ? (
              <>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <UserX className="size-4" />
                  Deactivate
                </DropdownMenuItem>
                <p className="px-2 pb-1 text-xs leading-snug text-muted-foreground">
                  {blockReason}
                </p>
              </>
            ) : (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmOpen(true);
                }}
              >
                <UserX className="size-4" />
                Deactivate
              </DropdownMenuItem>
            )
          ) : (
            <DropdownMenuItem onSelect={() => reactivate()}>
              <UserCheck className="size-4" />
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !pending && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {username}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;re signed out immediately and can&apos;t sign in again until an admin
              reactivates them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={pending} onClick={deactivate}>
              {pending ? "Deactivating…" : "Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
