// app/api/draft/route.ts
// Preview entry: ?secret=<PREVIEW_SECRET>&slug=/vi  enables Next draft mode and redirects to the
// page. The published shell is draftMode-free; only the <Suspense> preview island reads
// draftMode().isEnabled. DELETE exits preview.
import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const slug = searchParams.get("slug") || "/";
  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) {
    return new Response("Invalid token", { status: 401 });
  }
  const draft = await draftMode();
  draft.enable();
  // Only redirect to same-origin app paths (open-redirect guard).
  redirect(slug.startsWith("/") ? slug : "/");
}

export async function DELETE() {
  const draft = await draftMode();
  draft.disable();
  return new Response("Draft mode disabled");
}
