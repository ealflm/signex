"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CatalogActionState } from "./actions";

// ── Shared shapes ─────────────────────────────────────────────────────────────

export interface Loc {
  en: string;
  vi: string;
}

export type CatalogAction = (
  state: CatalogActionState,
  fd: FormData,
) => Promise<CatalogActionState>;

export const emptyState: CatalogActionState = {};

// Native <select> kept intentionally: name="imageId" / name="categoryId" post to a
// server action inside the surrounding <form>. Token classes only.
export const nativeSelectCls =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs " +
  "outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 " +
  "transition-[border-color,box-shadow] duration-150";

// ── Bilingual field (EN / VI side by side) ────────────────────────────────────

/**
 * A localized text pair rendered as two captioned controls. Posts `${base}.en`
 * and `${base}.vi` — the exact keys the server actions read via localized().
 */
export function LocalizedField({
  base,
  label,
  value,
  multiline,
  required,
  onEnInput,
}: {
  base: string;
  label: string;
  value: Loc;
  multiline?: boolean;
  required?: boolean;
  /** Fires with the current EN value on every change of the `.en` input.
   *  Used to auto-derive a slug from the English title (fields stay uncontrolled). */
  onEnInput?: (value: string) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-muted-foreground" aria-hidden>
            {" *"}
          </span>
        )}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {(["en", "vi"] as const).map((lang) => (
          <div key={lang} className="flex min-w-0 flex-col gap-1">
            <span
              className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
              aria-hidden
            >
              {lang}
            </span>
            {multiline ? (
              <Textarea
                name={`${base}.${lang}`}
                defaultValue={value[lang]}
                rows={2}
                required={required}
                aria-label={`${label} (${lang.toUpperCase()})`}
                className="resize-y text-sm"
              />
            ) : (
              <Input
                type="text"
                name={`${base}.${lang}`}
                defaultValue={value[lang]}
                required={required}
                aria-label={`${label} (${lang.toUpperCase()})`}
                className="text-sm"
                onChange={
                  lang === "en" && onEnInput
                    ? (e) => onEnInput(e.target.value)
                    : undefined
                }
              />
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}

// ── Feedback + submit ─────────────────────────────────────────────────────────

export function ActionFeedback({ state }: { state: CatalogActionState }) {
  if (state.error) {
    return (
      <p
        role="alert"
        aria-live="assertive"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {state.error}
      </p>
    );
  }
  return null;
}

export function SubmitButton({
  pending,
  idleLabel,
  pendingLabel,
}: {
  pending: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

// ── Delete (compact, confirm-guarded) ─────────────────────────────────────────

/**
 * Icon delete button that posts `hidden` fields to `action` behind a
 * window.confirm guard. Used for both categories (id) and products (id +
 * categoryId).
 */
export function DeleteButton({
  action,
  hidden,
  confirmMessage,
  srLabel,
}: {
  action: CatalogAction;
  hidden: Record<string, string>;
  confirmMessage: string;
  srLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, emptyState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-disabled={pending}
        aria-label={srLabel}
        title={state.error ?? srLabel}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Trash2 aria-hidden />
        )}
      </Button>
    </form>
  );
}
