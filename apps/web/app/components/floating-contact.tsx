// app/components/floating-contact.tsx
// Floating call + Zalo quick-contact buttons, fixed bottom-right on every page. The numbers come
// from businessContact.phones (kind "tel" / "zalo") — already editable in the admin — so there is
// no config flag: an emptied/removed entry simply hides its button. Server component, no JS.
import type { Dictionary } from "@/app/[lang]/dictionaries";

/** "(+84) 979 700 072" → "tel:+84979700072" — keep digits and one leading +. */
function telHref(value: string): string {
  const s = value.replace(/[^\d+]/g, "");
  return `tel:${s.startsWith("+") ? "+" + s.slice(1).replace(/\+/g, "") : s.replace(/\+/g, "")}`;
}

/** "(+84) 94 9999 326" → "https://zalo.me/0949999326" — digits, +84/84 prefix normalised to 0. */
function zaloHref(value: string): string {
  let d = value.replace(/\D/g, "");
  if (d.startsWith("84")) d = "0" + d.slice(2);
  return `https://zalo.me/${d}`;
}

export function FloatingContact({ dict }: { dict: Dictionary }) {
  const tel = dict.businessContact.phones.find((p) => p.kind === "tel")?.value?.trim();
  const zalo = dict.businessContact.phones.find((p) => p.kind === "zalo")?.value?.trim();
  if (!tel && !zalo) return null;
  return (
    <div className="sx-float-contact">
      {zalo ? (
        <a
          className="sx-float-btn is-zalo"
          href={zaloHref(zalo)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat Zalo"
        >
          Zalo
        </a>
      ) : null}
      {tel ? (
        <a className="sx-float-btn is-call" href={telHref(tel)} aria-label="Gọi điện">
          <svg aria-hidden="true" fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22" xmlns="http://www.w3.org/2000/svg">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        </a>
      ) : null}
    </div>
  );
}
