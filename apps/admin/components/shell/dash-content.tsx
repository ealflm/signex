"use client";

import { usePathname } from "next/navigation";

/**
 * Dash content wrapper. Most pages get comfortable padding + a centered max-width.
 * The editor (`/editor/*`) takes the FULL content area — edge-to-edge, no max-width —
 * so the canvas + side panels use all the available space (the Full-page toolbar toggle
 * still covers the sidebar/topbar on top of this).
 */
export function DashContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed = pathname.startsWith("/editor");

  if (fullBleed) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }

  return (
    <div className="flex-1 px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-screen-2xl">{children}</div>
    </div>
  );
}
