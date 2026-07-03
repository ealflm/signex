// app/components/analytics.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/app/lib/analytics/tracker";

/** Mounts once in the root layout. Fires page_view on load + every soft nav,
 *  plus delegated scroll-depth / CTA / outbound-click events. */
export function Analytics() {
  const pathname = usePathname();

  useEffect(() => {
    track("page_view");

    let scrolled = false;
    const onScroll = () => {
      if (scrolled) return;
      const doc = document.documentElement;
      const denom = doc.scrollHeight - window.innerHeight;
      if (denom <= 0) return;
      if ((window.scrollY / denom) >= 0.9) {
        scrolled = true;
        track("scroll", { meta: { depth: 90 } });
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("a,[data-cta]") as HTMLElement | null;
      if (!el) return;
      if (el.hasAttribute("data-cta")) {
        track("cta_click", { meta: { ctaId: el.getAttribute("data-cta") ?? undefined } });
        return;
      }
      if (el instanceof HTMLAnchorElement && el.href) {
        try {
          const u = new URL(el.href);
          if (u.host && u.host !== window.location.host) track("outbound_click", { meta: { href: u.href } });
        } catch {
          /* ignore non-URL href */
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
    };
  }, [pathname]);

  return null;
}
