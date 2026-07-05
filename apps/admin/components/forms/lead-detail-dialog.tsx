"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Archive,
  RotateCcw,
  Paperclip,
  Download,
  ExternalLink,
} from "lucide-react";
import type { SubmissionDto } from "@/app/lib/forms";
import { formatIsoDay, formatRelativeTime } from "@/app/lib/format";
import { adminApi } from "@/app/lib/base-path";
import { readLead, humanizeKey } from "./lead-utils";
import { cn } from "@/lib/utils";
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
import { StatusBadge } from "./lead-badges";

/** A titled block within the detail body. */
function Section({
  title,
  children,
  muted,
}: {
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <section className="p-5">
      <h3
        className={cn(
          "text-xs font-medium uppercase tracking-wide",
          muted ? "text-muted-foreground/70" : "text-muted-foreground",
        )}
      >
        {title}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/** A labelled key/value row inside Details / Technical. */
function MetaRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const multiline = typeof value === "string" && value.includes("\n");
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-1.5 sm:grid-cols-[8rem_1fr]">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm text-foreground",
          mono && "font-mono text-xs tabular-nums text-muted-foreground",
        )}
      >
        {multiline ? (
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {value}
          </pre>
        ) : (
          value
        )}
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

  const { name, email, phone, company, subject, message, rest } = readLead(
    lead.payload,
  );

  // Every payload key that isn't the sender identity or the message lands here,
  // so the detail view stays complete no matter what a form sends.
  const detailRows: Array<{ label: string; value: string }> = [];
  if (subject) detailRows.push({ label: "Subject", value: subject });
  if (company) detailRows.push({ label: "Company", value: company });
  for (const r of rest) detailRows.push({ label: humanizeKey(r.key), value: r.value });

  async function setStatus(next: "NEW" | "READ" | "ARCHIVED") {
    setPending(next);
    setError(null);
    try {
      const res = await fetch(adminApi(`/admin-api/forms/${lead.id}`), {
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
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl">
      <DialogHeader className="space-y-0 border-b border-border p-5 text-left">
        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} />
        </div>
        <DialogTitle className="mt-3 text-lg">
          {name || "Unknown sender"}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {email ? (
              <a
                href={`mailto:${email}`}
                className="rounded-sm font-medium text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {email}
              </a>
            ) : (
              <span className="text-muted-foreground">No email provided</span>
            )}
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="rounded-sm font-mono tabular-nums text-muted-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {phone}
              </a>
            )}
          </div>
        </DialogDescription>
      </DialogHeader>

      <ScrollArea className="max-h-[60vh]">
        <div className="divide-y divide-border">
          {message && (
            <Section title="Message">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {message}
              </p>
            </Section>
          )}

          {detailRows.length > 0 && (
            <Section title="Details">
              <dl>
                {detailRows.map((r) => (
                  <MetaRow key={r.label} label={r.label} value={r.value} />
                ))}
              </dl>
            </Section>
          )}

          <Section title="Attachment">
            {lead.upload ? (
              lead.upload.mime.startsWith("image/") ? (
                // The uploaded sample is what the reader opened this for — frame it.
                // Clicking the frame opens the original full-size in a new tab; the
                // Download button below is the separate "save" action.
                <figure className="space-y-2">
                  <a
                    href={lead.upload.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Open ${lead.upload.originalName} full size in a new tab`}
                    className="group relative block overflow-hidden rounded-md border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- external asset URL, no next/image domain config */}
                    <img
                      src={lead.upload.url}
                      alt={lead.upload.originalName}
                      loading="lazy"
                      className="mx-auto max-h-60 w-full object-contain"
                    />
                    <span className="pointer-events-none absolute right-2 top-2 flex items-center rounded-md bg-background/80 p-1.5 text-foreground opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ExternalLink className="size-3.5" aria-hidden />
                    </span>
                  </a>
                  <figcaption className="flex items-center gap-2">
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-foreground"
                      title={lead.upload.originalName}
                    >
                      {lead.upload.originalName}
                    </span>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1.5"
                    >
                      <a
                        href={lead.upload.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        download={lead.upload.originalName}
                      >
                        <Download className="size-3.5" aria-hidden />
                        Download
                      </a>
                    </Button>
                  </figcaption>
                </figure>
              ) : (
                // Non-image mime — keep the compact download chip.
                <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                  <a
                    href={lead.upload.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    download={lead.upload.originalName}
                  >
                    <Paperclip className="size-3.5" aria-hidden />
                    <span className="max-w-[16rem] truncate">
                      {lead.upload.originalName}
                    </span>
                    <Download className="size-3.5 shrink-0" aria-hidden />
                  </a>
                </Button>
              )
            ) : (
              <p className="text-sm text-muted-foreground">No file attached.</p>
            )}
          </Section>

          <Section title="Technical" muted>
            <dl>
              <MetaRow
                label="Submitted"
                value={
                  <span title={new Date(lead.createdAt).toLocaleString()}>
                    {formatRelativeTime(lead.createdAt)}
                    <span className="ml-2 text-muted-foreground/70">
                      ({formatIsoDay(lead.createdAt)})
                    </span>
                  </span>
                }
              />
              <MetaRow label="IP" value={lead.ip ?? "—"} mono />
              <MetaRow label="User agent" value={lead.userAgent ?? "—"} mono />
              <MetaRow label="Reference" value={lead.id} mono />
            </dl>
          </Section>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-5 mb-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        )}
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
