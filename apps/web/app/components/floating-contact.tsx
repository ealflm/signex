// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. Links from the
// floatingButtons block (fallback: businessContact phones). r3: 3× size + pulse (CSS), and a
// hover label pill whose number DERIVES from the configured link (displayNumber) — never
// hardcoded. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { resolveCallHref, resolveZaloHref, displayNumber } from "./floating-contact.links";

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const phones = dict.businessContact.phones;
  const telPhone = phones.find((p) => p.kind === "tel")?.value;
  const zaloPhone = phones.find((p) => p.kind === "zalo")?.value;
  const call = resolveCallHref(dict.floatingButtons.callHref, telPhone);
  const zalo = resolveZaloHref(dict.floatingButtons.zaloHref, zaloPhone);
  const callNewTab = /^https?:/i.test(call);
  if (!call && !zalo) return null;
  const vi = dict.locale !== "en";
  const zaloNum = zalo ? displayNumber(zalo) : null;
  const callNum = call ? displayNumber(call) : null;
  const zaloLabel = zaloNum ? `Chat zalo ${zaloNum}` : vi ? "Chat Zalo" : "Zalo chat";
  const callLabel = callNum ? `Hotline ${callNum}` : vi ? "Gọi ngay" : "Call now";
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <div className="sx-float-item">
          <span className="sx-float-label" aria-hidden="true">{zaloLabel}</span>
          <a
            className="sx-float-btn is-zalo"
            href={zalo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={zaloLabel}
            data-sx-c="floatBtn.zalo"
          >
            Zalo
          </a>
        </div>
      ) : null}
      {call ? (
        <div className="sx-float-item">
          <span className="sx-float-label" aria-hidden="true">{callLabel}</span>
          <a
            className="sx-float-btn is-call"
            href={call}
            aria-label={callLabel}
            data-sx-c="floatBtn.call"
            {...(callNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </a>
        </div>
      ) : null}
    </div>
  );
}
