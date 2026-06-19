// /404 page. Server component: it ONLY exports metadata (to clear the SEO tags it would otherwise
// inherit from the [lang] layout) and renders the client <NotFoundView/>. The locale-dependent UI
// lives in the client view (locale from usePathname) — critically, this file no longer calls
// headers()/cookies(), which previously opted the WHOLE [lang] subtree out of static generation.
import type { Metadata } from "next";
import { NotFoundView } from "@/app/components/not-found-view";

export const metadata: Metadata = {
  title: "Page not found | SIGNEX",
  // A noindex 404 must NOT inherit the layout's canonical→homepage / hreflang cluster / OG-Twitter
  // (Next merges metadata shallowly; null clears, undefined would inherit). Next auto-injects
  // <meta name="robots" content="noindex"> for notFound() responses, so robots isn't set here.
  alternates: { canonical: null, languages: {} },
  openGraph: null,
  twitter: null,
};

export default function NotFound() {
  return <NotFoundView />;
}
