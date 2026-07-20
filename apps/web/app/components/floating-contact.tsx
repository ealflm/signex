// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. Each button's link
// comes from the floatingButtons block (callHref / zaloHref, editable in the admin); when a link is
// empty it falls back to the businessContact phone (tel:/zalo.me), so nothing breaks with no config.
// A button whose resolved href is empty is not rendered. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { resolveCallHref, resolveZaloHref } from "./floating-contact.links";

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const phones = dict.businessContact.phones;
  const telPhone = phones.find((p) => p.kind === "tel")?.value;
  const zaloPhone = phones.find((p) => p.kind === "zalo")?.value;
  const call = resolveCallHref(dict.floatingButtons.callHref, telPhone);
  const zalo = resolveZaloHref(dict.floatingButtons.zaloHref, zaloPhone);
  if (!call && !zalo) return null;
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <a
          className="sx-float-btn is-zalo"
          href={zalo}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat Zalo"
        >
          Zalo
        </a>
      ) : null}
      {call ? (
        <a className="sx-float-btn is-call" href={call} aria-label="Gọi điện">
          <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
