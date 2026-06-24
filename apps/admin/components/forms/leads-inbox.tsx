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
import { formatIsoDay, formatRelativeDate, readContact } from "@/app/lib/format";
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
import { FormBadge, StatusBadge } from "./lead-badges";
import { LeadDetailDialog } from "./lead-detail-dialog";

type StatusFilter = "ALL" | "NEW" | "READ" | "ARCHIVED";
type FormFilter = "ALL" | "quote" | "contact";
type Order = "asc" | "desc";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
];

const FORM_TABS: { value: FormFilter; label: string }[] = [
  { value: "ALL", label: "All forms" },
  { value: "quote", label: "Quote" },
  { value: "contact", label: "Contact" },
];

export interface LeadsInboxProps {
  items: SubmissionDto[];
  total: number;
  /** Active query state (server-driven via the URL). */
  page: number;
  pageSize: number;
  status: StatusFilter;
  formKey: FormFilter;
  order: Order;
}

export function LeadsInbox({
  items,
  total,
  page,
  pageSize,
  status,
  formKey,
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
        id: "form",
        header: () => <HeaderLabel>Form</HeaderLabel>,
        cell: ({ row }) => <FormBadge formKey={row.original.formKey} />,
      },
      {
        id: "contact",
        header: () => <HeaderLabel>Contact</HeaderLabel>,
        cell: ({ row }) => {
          const { name, email } = readContact(row.original.payload);
          return (
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                {name || "Unknown"}
                {row.original.upload && (
                  <Paperclip
                    className="size-3 shrink-0 text-muted-foreground"
                    aria-label="Has attachment"
                  />
                )}
              </span>
              {email && (
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              )}
            </div>
          );
        },
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
            className="font-mono text-xs tabular-nums text-muted-foreground"
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
            value={formKey}
            onValueChange={(v) =>
              setQuery({ formKey: v === "ALL" ? null : v })
            }
          >
            <TabsList className="h-8 bg-muted/60">
              {FORM_TABS.map((t) => (
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
            status !== "ALL" || formKey !== "ALL"
              ? "No leads match the current filters. Try clearing them."
              : "Submissions from your contact and quote forms will show up here."
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
                {table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open submission from ${
                      readContact(row.original.payload).name || "unknown"
                    }`}
                    onClick={() => openRow(row.original)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(row.original);
                      }
                    }}
                    className="cursor-pointer border-border outline-none transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-5 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
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
