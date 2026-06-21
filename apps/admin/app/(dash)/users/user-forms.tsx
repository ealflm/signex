"use client";

import { useFormStatus } from "react-dom";
import { deactivateUser, updateUserRole } from "./actions";
import type { RoleName } from "@signex/shared";

const ROLES: RoleName[] = ["EDITOR", "PUBLISHER", "ADMIN"];

// ── Update role form ──────────────────────────────────────────────────────────

function SetRoleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700
                 transition-colors hover:bg-gray-50
                 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1
                 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Set"}
    </button>
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
        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm
                   focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1"
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
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="rounded px-2 py-1 text-xs font-medium text-red-600
                 transition-colors hover:bg-red-50
                 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-1
                 disabled:opacity-50"
    >
      {pending ? "Deactivating…" : "Deactivate"}
    </button>
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
