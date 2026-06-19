// app/components/webflow-page-attrs.tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { profileForRoute, siteAttrs } from "@/app/lib/webflow-bundles";

export function WebflowPageAttrs() {
  const pathname = usePathname();
  useEffect(() => {
    const html = document.documentElement;
    const { domain, site } = siteAttrs();
    html.setAttribute("data-wf-domain", domain);
    html.setAttribute("data-wf-site", site);
    const { wfPage, wfCollection } = profileForRoute(pathname);
    // Clear a stale id on routes not yet in the map rather than leaving the previous page's value.
    if (wfPage) html.setAttribute("data-wf-page", wfPage);
    else html.removeAttribute("data-wf-page");
    if (wfCollection) html.setAttribute("data-wf-collection", wfCollection);
    else html.removeAttribute("data-wf-collection");
  }, [pathname]);
  return null;
}
