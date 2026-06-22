"use client";

import { useFormStatus } from "react-dom";
import { deactivateUser, updateUserRole } from "./actions";
import type { RoleName } from "@signex/shared";
import { Button } from "@/components/ui/button";

const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

// ── Update role form ──────────────────────────────────────────────────────────

function SetRoleButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? "Saving…" : "Set"}
    </Button>
  );
}

export function UpdateRoleForm({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: RoleName;
}) {
  return (
    <form action={updateUserRole} className="flex items-center gap-1">
      <input type="hidden" name="id" value={userId} />
      <label htmlFor={`role-${userId}`} className="sr-only">
        Role
      </label>
      <select
        id={`role-${userId}`}
        name="role"
        defaultValue={currentRole}
        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <SetRoleButton />
    </form>
  );
}

// ── Deactivate form ───────────────────────────────────────────────────────────

function DeactivateButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-disabled={pending}
      className="text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      {pending ? "Deactivating…" : "Deactivate"}
    </Button>
  );
}

export function DeactivateForm({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  return (
    <form
      action={deactivateUser}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Deactivate ${email}? Their sessions will be revoked immediately.`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={userId} />
      <DeactivateButton />
    </form>
  );
}
