import { requireRole } from "@/app/lib/session";
import {
  fetchSubmissions,
  fetchSummary,
  type FormKey,
  type SubmissionStatus,
} from "@/app/lib/forms";
import { PageHeader } from "@/components/admin/page-header";
import { LeadsKpiStrip } from "@/components/forms/leads-kpi-strip";
import { LeadsInbox } from "@/components/forms/leads-inbox";

const PAGE_SIZE = 20;

type StatusFilter = "ALL" | SubmissionStatus;
type FormFilter = "ALL" | FormKey;

/** Read the first string value of a (possibly array) searchParam. */
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseStatus(v: string | undefined): StatusFilter {
  return v === "NEW" || v === "READ" || v === "ARCHIVED" ? v : "ALL";
}
function parseFormKey(v: string | undefined): FormFilter {
  return v === "quote" || v === "contact" ? v : "ALL";
}

/**
 * Leads inbox — form submissions management (RSC, EDITOR+).
 * Server-fetches the active page + summary; filters/sort/pagination are all
 * server-driven via the URL query (?status,?formKey,?page,?order). The client
 * inbox component only handles interaction (navigation, the detail dialog).
 */
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireRole("EDITOR");

  const sp = await searchParams;
  const status = parseStatus(first(sp.status));
  const formKey = parseFormKey(first(sp.formKey));
  const order: "asc" | "desc" = first(sp.order) === "asc" ? "asc" : "desc";
  const pageRaw = parseInt(first(sp.page) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const filters = {
    status: status === "ALL" ? undefined : status,
    formKey: formKey === "ALL" ? undefined : formKey,
    order,
  };

  const [summary, firstList] = await Promise.all([
    fetchSummary(),
    fetchSubmissions({ take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, ...filters }),
  ]);

  // Clamp an out-of-range page (hand-typed ?page=99, or the last row on the last
  // page archived then refreshed) back to the real last page so the user is never
  // stranded on an empty view whose pager (rendered only when rows exist) is gone.
  const pageCount = Math.max(1, Math.ceil(firstList.total / PAGE_SIZE));
  const effectivePage = page > pageCount ? pageCount : page;
  const list =
    effectivePage === page
      ? firstList
      : await fetchSubmissions({
          take: PAGE_SIZE,
          skip: (effectivePage - 1) * PAGE_SIZE,
          ...filters,
        });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        subtitle="Quote and contact requests sent from your website."
      />

      <LeadsKpiStrip summary={summary} />

      <LeadsInbox
        items={list.items}
        total={list.total}
        page={effectivePage}
        pageSize={PAGE_SIZE}
        status={status}
        formKey={formKey}
        order={order}
      />
    </div>
  );
}
