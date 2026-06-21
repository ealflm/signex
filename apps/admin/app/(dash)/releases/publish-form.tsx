"use client";

import { useActionState } from "react";
import { publishAction, type ActionState } from "./actions";

interface PublishFormProps {
  expectedRevision: number;
  dirty: boolean;
}

const initialState: ActionState = {};

export function PublishForm({ expectedRevision, dirty }: PublishFormProps) {
  const [state, formAction, pending] = useActionState(
    publishAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      {/* Optimistic-lock value — must be the CURRENT working revision from /api/releases/diff */}
      <input type="hidden" name="expectedRevision" value={expectedRevision} />

      {state.error && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {state.error === "Conflict" ||
          state.error?.toLowerCase().includes("conflict") ||
          state.error?.includes("409")
            ? "Publish failed: the working state has changed since this page loaded (optimistic lock). Refresh and try again."
            : `Publish failed: ${state.error}`}
        </p>
      )}

      {state.success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700"
        >
          Published successfully.
        </p>
      )}

      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
          Release note (optional)
          <textarea
            name="note"
            rows={2}
            placeholder="Describe what changed…"
            className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm
                       placeholder-gray-400 shadow-sm
                       focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900
                       disabled:opacity-50"
            disabled={pending || !dirty}
          />
        </label>

        <button
          type="submit"
          disabled={pending || !dirty}
          aria-disabled={pending || !dirty}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm
                     transition-colors hover:bg-gray-700
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Publishing…" : "Publish"}
        </button>
      </div>

      {!dirty && (
        <p className="text-xs text-gray-500">
          No unpublished changes — publish is only available when the working
          state differs from the last published version.
        </p>
      )}
    </form>
  );
}
