// app/api/revalidate/route.ts
// On-demand revalidation, fired by the api AFTER a publish/rollback commit (spec §10.3).
// Secret-protected (restrict to the internal network at the proxy). One tag 'release' covers
// every page (every cached read tagged it in app/lib/content.ts); revalidatePath warms the
// resolved literal shells (incl. NEW slugs, now reachable because product segments are
// dynamicParams=true). revalidateTag's 2-arg 'max' = stale-while-revalidate (NOT instant).
import { revalidateTag, revalidatePath } from "next/cache";

export async function POST(req: Request) {
  if (req.headers.get("x-revalidate-secret") !== process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false }, { status: 401 });
  }
  let paths: string[] = [];
  let tags: string[] = [];
  try {
    const body = (await req.json()) as { paths?: string[]; tags?: string[] };
    paths = body.paths ?? [];
    tags = body.tags ?? [];
  } catch {
    paths = [];
    tags = [];
  }
  // No tags → legacy content-publish behavior: revalidate 'release' (covers every
  // composed page). With tags → revalidate exactly those (catalog publish sends
  // ['catalog']). The composed page loader tags itself with BOTH, so either works.
  const toRevalidate = tags.length ? tags : ["release"];
  for (const tag of toRevalidate) revalidateTag(tag, "max"); // 16.2 REQUIRED 2nd arg
  for (const p of paths) revalidatePath(p);
  return Response.json({
    ok: true,
    revalidated: paths.length,
    tags: toRevalidate,
    now: Date.now(),
  });
}
