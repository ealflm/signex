/**
 * Shared client/server types + fetch helper for the Leads inbox.
 * Mirrors the api's PublicSubmission shape (apps/api/src/forms/forms.service.ts):
 * the upload is the resolved public attachment metadata — never raw bytes,
 * never internal asset columns (sha256/r2Key/uploadedBy/...).
 */
import { apiServer } from "./api";

export type SubmissionStatus = "NEW" | "READ" | "ARCHIVED";

/** Resolved attachment — `null` when the submission has no upload. */
export interface SubmissionUpload {
  assetId: string;
  url: string;
  originalName: string;
  mime: string;
}

/** One row as returned by GET /api/forms and GET /api/forms/:id. */
export interface SubmissionDto {
  id: string;
  formKey: string;
  status: string;
  payload: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  upload: SubmissionUpload | null;
}

export interface SubmissionListResponse {
  items: SubmissionDto[];
  total: number;
}

export interface SubmissionSummary {
  total: number;
  new: number;
  read: number;
  archived: number;
  /** Flagged spam/duplicate count (excluded from the figures above). */
  spam: number;
  series: Array<{ date: string; count: number }>;
}

/** Server-side: fetch the first page of submissions (EDITOR+, session-gated). */
export async function fetchSubmissions(params: {
  take?: number;
  skip?: number;
  status?: SubmissionStatus;
  /** `true` = the flagged-spam view; otherwise the inbox excludes spam. */
  spam?: boolean;
  order?: "asc" | "desc";
} = {}): Promise<SubmissionListResponse> {
  const qs = new URLSearchParams();
  if (params.take != null) qs.set("take", String(params.take));
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.status) qs.set("status", params.status);
  if (params.spam) qs.set("spam", "1");
  if (params.order) qs.set("order", params.order);
  const q = qs.toString();
  const res = await apiServer<SubmissionListResponse>(
    `/api/forms${q ? `?${q}` : ""}`,
  );
  return res.ok ? res.data : { items: [], total: 0 };
}

/** Server-side: fetch the inbox summary KPIs (EDITOR+, session-gated). */
export async function fetchSummary(): Promise<SubmissionSummary> {
  const res = await apiServer<SubmissionSummary>("/api/forms/summary");
  return res.ok
    ? res.data
    : { total: 0, new: 0, read: 0, archived: 0, spam: 0, series: [] };
}
