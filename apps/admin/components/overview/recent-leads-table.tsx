"use client";

import * as React from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Paperclip,
} from "lucide-react";
import type { RecentLead } from "@/app/lib/overview";
import { formatIsoDay, formatRelativeDate, readContact } from "@/app/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StatusFilter = "ALL" | "NEW" | "READ" | "ARCHIVED";

function StatusBadge({ status }: { status: string }) {
  // Tinh tế: NEW = accent tint, READ = muted, ARCHIVED = neutral outline.
  if (status === "NEW") {
    // Accent tint reads as "new", but the label stays foreground for AA contrast
    // in both themes; the primary dot carries the accent (not color-alone — text says "New").
    return (
      <Badge className="gap-1.5 border-primary/25 bg-primary/10 text-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        New
      </Badge>
    );
  }
  if (status === "READ") {
    return (
      <Badge variant="secondary" className="text-muted-foreground">
        Read
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Archived
    </Badge>
  );
}

function FormBadge({ formKey }: { formKey: string }) {
  const isQuote = formKey === "quote";
  return (
    <Badge
      variant="outline"
      className={
        isQuote
          ? "border-chart-2/30 text-foreground/80"
          : "border-border text-muted-foreground"
      }
    >
      {isQuote ? "Quote" : "Contact"}
    </Badge>
  );
}

function SortHeader({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 rounded text-xs font-medium uppercase tracking-wide text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <ArrowUpDown
        className={"size-3 " + (active ? "text-foreground" : "text-muted-foreground/50")}
        aria-hidden
      />
    </button>
  );
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "READ", label: "Read" },
  { value: "ARCHIVED", label: "Archived" },
];

const PAGE_SIZE = 6;

export function RecentLeadsTable({ items }: { items: RecentLead[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  const columns = React.useMemo<ColumnDef<RecentLead>[]>(
    () => [
      {
        id: "form",
        accessorKey: "formKey",
        header: () => (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Form
          </span>
        ),
        cell: ({ row }) => <FormBadge formKey={row.original.formKey} />,
        enableSorting: false,
      },
      {
        id: "contact",
        header: () => (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contact
          </span>
        ),
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
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              )}
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "status",
        accessorKey: "status",
        header: () => (
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Status
          </span>
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
        enableSorting: false,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <SortHeader
            label="Date"
            active={Boolean(column.getIsSorted())}
            onToggle={() => column.toggleSorting(column.getIsSorted() === "asc")}
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
        sortingFn: (a, b) =>
          new Date(a.original.createdAt).getTime() -
          new Date(b.original.createdAt).getTime(),
      },
    ],
    [],
  );

  const filtered = React.useMemo(
    () => (status === "ALL" ? items : items.filter((i) => i.status === status)),
    [items, status],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Recent leads</h2>
          <p className="text-xs text-muted-foreground tabular-nums">
            {filtered.length} {filtered.length === 1 ? "submission" : "submissions"}
          </p>
        </div>
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            table.setPageIndex(0);
          }}
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
      </header>

      {items.length === 0 ? (
        <EmptyState />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 px-5 py-12 text-center">
          <Inbox className="size-5 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">No {status.toLowerCase()} leads</p>
        </div>
      ) : (
        <>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_tr]:border-b [&_tr]:border-border">
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => (
                      <TableHead key={header.id} scope="col" className="h-10 px-5">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-border transition-colors duration-150 hover:bg-muted/50"
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
              <p className="text-xs text-muted-foreground tabular-nums">
                Page {pageIndex + 1} of {pageCount}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-sm font-medium text-foreground">No leads yet</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Submissions from your contact and quote forms will show up here.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-1">
        <Link href="/releases">View site status</Link>
      </Button>
    </div>
  );
}
