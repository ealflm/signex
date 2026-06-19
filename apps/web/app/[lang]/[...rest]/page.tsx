// Catch-all for any unmatched path under a locale (e.g. /en/does-not-exist).
// Without this, Next renders its bare default /_not-found for unmatched URLs — the
// segment-level app/[lang]/not-found.tsx only fires when notFound() is thrown inside the
// [lang] subtree. Throwing notFound() here routes the request to app/[lang]/not-found.tsx,
// rendered inside the localized layout (navbar/footer) with a proper 404 HTTP status.
// Real routes (/, /about, /contact) match their explicit segments first, so this only
// catches genuinely missing pages.
import { notFound } from "next/navigation";

export default function CatchAll(): never {
  notFound();
}
