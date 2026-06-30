"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Paperclip,
} from "lucide-react";
import type { SubmissionDto } from "@/app/lib/forms";
import { formatIsoDay, formatRelativeDate } from "@/app/lib/format";
import { readLead, previewOf } from "./lead-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "./lead-badges";
import { LeadDetailDialog } from "./lead-detail-dialog";

type StatusFilter = "ALL" | "NEW" | "READ" | "ARCHIVED";
type Order = "asc" | "desc";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
];

export interface LeadsInboxProps {
  items: SubmissionDto[];
  total: number;
  /** Active query state (server-driven via the URL). */
  page: number;
  pageSize: number;
  status: StatusFilter;
  order: Order;
}

export function LeadsInbox({
  items,
  total,
  page,
  pageSize,
  status,
  order,
}: LeadsInboxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = React.useState<SubmissionDto | null>(null);
  const [open, setOpen] = React.useState(false);

  // Push a new URL with the merged query; reset to page 1 on any filter/sort change.
  const setQuery = React.useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const openRow = React.useCallback((lead: SubmissionDto) => {
    setSelected(lead);
    setOpen(true);
  }, []);

  const columns = React.useMemo<ColumnDef<SubmissionDto>[]>(
    () => [
      {
        id: "lead",
        header: () => <HeaderLabel>Lead</HeaderLabel>,
        cell: ({ row }) => <LeadCell lead={row.original} />,
      },
      {
        id: "status",
        header: () => <HeaderLabel>Status</HeaderLabel>,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "createdAt",
        header: () => (
          <SortHeader
            label="Date"
            order={order}
            onToggle={() =>
              setQuery({ order: order === "desc" ? "asc" : "desc" }, false)
            }
          />
        ),
        cell: ({ row }) => (
          <span
            className="font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground"
            title={formatIsoDay(row.original.createdAt)}
          >
            {formatRelativeDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [order, setQuery],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {total === 0
              ? "No submissions"
              : `Showing ${from}–${to} of ${total}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={status}
            onValueChange={(v) =>
              setQuery({ status: v === "ALL" ? null : v })
            }
          >
            <TabsList className="h-8 bg-muted/60">
              {STATUS_TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="px-2.5 text-xs data-[state=active]:text-primary"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No submissions"
          description={
            status !== "ALL"
              ? "No leads match the current filter. Try clearing it."
              : "Submissions from your website forms will show up here."
          }
        />
      ) : (
        <>
          <div className="max-h-[560px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_tr]:border-b [&_tr]:border-border">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} scope="col" className="h-10 px-5">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => {
                  // Signature: a NEW lead reads like unread mail — a primary rail
                  // down its left edge + a faint tint, so the unhandled requests
                  // light up at a glance and the rest stay quiet.
                  const isNew = row.original.status === "NEW";
                  return (
                    <TableRow
                      key={row.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open submission from ${
                        readLead(row.original.payload).name || "unknown sender"
                      }`}
                      onClick={() => openRow(row.original)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openRow(row.original);
                        }
                      }}
                      className={cn(
                        "cursor-pointer border-border outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        isNew && "bg-primary/[0.03]",
                      )}
                    >
                      {row.getVisibleCells().map((cell, i) => (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            "px-5 py-3.5 align-top",
                            // The rail lives on the first cell so it renders a
                            // reliable full-height bar; transparent on read rows
                            // keeps every row the same width.
                            i === 0 && "border-l-2",
                            i === 0 &&
                              (isNew ? "border-l-primary" : "border-l-transparent"),
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {pageCount > 1 && (
            <footer className="flex items-center justify-between border-t border-border px-5 py-3">
              <p className="text-xs tabular-nums text-muted-foreground">
                Page {page} of {pageCount}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={page <= 1}
                  onClick={() => setQuery({ page: String(page - 1) }, false)}
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={page >= pageCount}
                  onClick={() => setQuery({ page: String(page + 1) }, false)}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </footer>
          )}
        </>
      )}

      <LeadDetailDialog lead={selected} open={open} onOpenChange={setOpen} />
    </section>
  );
}

function HeaderLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * The inbox row's primary cell: who wrote in, how to reach them, and a one-line
 * gist of what they asked — so a row is triageable without opening it. A NEW
 * lead's name reads bolder (it pairs with the row's unread rail).
 */
function LeadCell({ lead }: { lead: SubmissionDto }) {
  const { name, email, phone } = readLead(lead.payload);
  const preview = previewOf(lead.payload);
  const contactLine = [email, phone].filter(Boolean).join(" · ");
  const isNew = lead.status === "NEW";

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-sm text-foreground",
            isNew ? "font-semibold" : "font-medium",
          )}
        >
          {name || "Unknown sender"}
        </span>
        {lead.upload && (
          <Paperclip
            className="size-3 shrink-0 text-muted-foreground"
            aria-label="Has attachment"
          />
        )}
      </div>
      {contactLine && (
        <span className="truncate text-xs text-muted-foreground">
          {contactLine}
        </span>
      )}
      {preview && (
        <span className="truncate text-xs text-muted-foreground/70">
          {preview}
        </span>
      )}
    </div>
  );
}

function SortHeader({
  label,
  order,
  onToggle,
}: {
  label: string;
  order: Order;
  onToggle: () => void;
}) {
  const Icon = order === "desc" ? ArrowDown : ArrowUp;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort by ${label}, currently ${
        order === "desc" ? "newest first" : "oldest first"
      }`}
      className="inline-flex items-center gap-1.5 rounded text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <Icon className="size-3 text-foreground" aria-hidden />
    </button>
  );
}
