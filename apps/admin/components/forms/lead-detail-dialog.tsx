"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Archive,
  RotateCcw,
  Paperclip,
  Download,
} from "lucide-react";
import type { SubmissionDto } from "@/app/lib/forms";
import { formatIsoDay } from "@/app/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FormBadge, StatusBadge } from "./lead-badges";

/** Human label for a payload key (camelCase / snake_case → Title Case). */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Flatten a payload object into ordered [label, value] rows; objects/arrays → JSON. */
function payloadRows(payload: unknown): Array<{ key: string; value: string }> {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>).map(
    ([key, raw]) => {
      let value: string;
      if (raw == null) value = "—";
      else if (typeof raw === "object") value = JSON.stringify(raw, null, 2);
      else value = String(raw);
      return { key: humanizeKey(key), value };
    },
  );
}

/** A labelled key/value row, styled like the admin <Field>. */
function MetaRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 border-b border-border py-2.5 last:border-0 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          "min-w-0 break-words text-sm text-foreground " +
          (mono ? "font-mono text-xs tabular-nums text-muted-foreground" : "")
        }
      >
        {children}
      </dd>
    </div>
  );
}

interface LeadDetailDialogProps {
  lead: SubmissionDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadDetailDialog({
  lead,
  open,
  onOpenChange,
}: LeadDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Keyed by id so each lead gets a fresh body mount — transient pending/error
          state resets without a setState-in-effect. Guard on `lead` for the
          first render before any row is selected. */}
      {lead && (
        <LeadDetailBody key={lead.id} lead={lead} onOpenChange={onOpenChange} />
      )}
    </Dialog>
  );
}

function LeadDetailBody({
  lead,
  onOpenChange,
}: {
  lead: SubmissionDto;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const rows = payloadRows(lead.payload);

  async function setStatus(next: "NEW" | "READ" | "ARCHIVED") {
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/admin-api/forms/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        setError(`Could not update (${res.status}). ${text}`.trim());
        setPending(null);
        return;
      }
      // Refresh the RSC tree so the row + KPIs reflect the new status, then close.
      router.refresh();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPending(null);
    }
  }

  return (
    <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border p-5">
          <div className="flex items-center gap-2">
            <FormBadge formKey={lead.formKey} />
            <StatusBadge status={lead.status} />
          </div>
          <DialogTitle className="mt-2 text-base">Submission detail</DialogTitle>
          <DialogDescription className="font-mono text-xs tabular-nums">
            {lead.id}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh]">
          <div className="p-5">
            <dl>
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payload fields.
                </p>
              ) : (
                rows.map((r) => (
                  <MetaRow key={r.key} label={r.key}>
                    {r.value.includes("\n") ? (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                        {r.value}
                      </pre>
                    ) : (
                      r.value
                    )}
                  </MetaRow>
                ))
              )}

              <MetaRow label="Submitted" mono>
                {new Date(lead.createdAt).toLocaleString()}
                <span className="ml-2 text-muted-foreground/70">
                  ({formatIsoDay(lead.createdAt)})
                </span>
              </MetaRow>
              <MetaRow label="IP" mono>
                {lead.ip ?? "—"}
              </MetaRow>
              <MetaRow label="User agent" mono>
                {lead.userAgent ?? "—"}
              </MetaRow>
              <MetaRow label="Attachment">
                {lead.upload ? (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                  >
                    <a
                      href={lead.upload.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      download={lead.upload.originalName}
                    >
                      <Paperclip className="size-3.5" aria-hidden />
                      <span className="max-w-[14rem] truncate">
                        {lead.upload.originalName}
                      </span>
                      <Download className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  </Button>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </MetaRow>
            </dl>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-row justify-end gap-2 border-t border-border p-4">
          {lead.status !== "READ" && lead.status !== "ARCHIVED" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={pending !== null}
              onClick={() => setStatus("READ")}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              {pending === "READ" ? "Saving…" : "Mark read"}
            </Button>
          )}
          {lead.status !== "ARCHIVED" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={pending !== null}
              onClick={() => setStatus("ARCHIVED")}
            >
              <Archive className="size-3.5" aria-hidden />
              {pending === "ARCHIVED" ? "Saving…" : "Archive"}
            </Button>
          )}
          {(lead.status === "ARCHIVED" || lead.status === "READ") && (
            <Button
              variant="default"
              size="sm"
              className="h-8 gap-1.5"
              disabled={pending !== null}
              onClick={() => setStatus("NEW")}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {pending === "NEW" ? "Saving…" : "Reopen"}
            </Button>
          )}
        </DialogFooter>
    </DialogContent>
  );
}
