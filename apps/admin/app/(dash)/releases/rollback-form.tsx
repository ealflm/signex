"use client";

import { useActionState } from "react";
import { rollbackAction, type ActionState } from "./actions";

interface RollbackFormProps {
  toVersion: number;
}

const initialState: ActionState = {};

export function RollbackForm({ toVersion }: RollbackFormProps) {
  const [state, formAction, pending] = useActionState(
    rollbackAction,
    initialState,
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Roll back to version ${toVersion}? This will immediately change the live site.`,
    );
    if (!confirmed) {
      e.preventDefault();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {state.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-xs text-red-600"
          title={state.error}
        >
          Error: {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" aria-live="polite" className="text-xs text-green-700">
          Rolled back.
        </p>
      )}
      <form
        action={formAction}
        onSubmit={handleSubmit}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="toVersion" value={toVersion} />
        <label className="flex cursor-pointer items-center gap-1 text-xs text-gray-500">
          <input
            type="checkbox"
            name="restoreWorkingState"
            className="h-3.5 w-3.5 rounded border-gray-300 focus:ring-gray-900"
          />
          restore draft
        </label>
        <button
          type="submit"
          disabled={pending}
          aria-disabled={pending}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700
                     transition-colors hover:border-gray-500 hover:bg-gray-50
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Rolling back…" : "Roll back"}
        </button>
      </form>
    </div>
  );
}
