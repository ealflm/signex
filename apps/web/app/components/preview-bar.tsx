// app/components/preview-bar.tsx
// draftMode() is read ONLY here, inside <Suspense>, so the published shell stays cached + SSG
// (spec §10.1). When draft mode is on, render a fixed banner with an exit affordance.
import { Suspense } from "react";
import { draftMode } from "next/headers";

async function PreviewBanner() {
  const { isEnabled } = await draftMode();
  if (!isEnabled) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9999,
        background: "#071522", color: "#fff", padding: "8px 16px",
        display: "flex", gap: 12, justifyContent: "center", alignItems: "center",
        fontFamily: "monospace", fontSize: 13,
      }}
    >
      <span>Draft preview</span>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/api/draft" style={{ color: "#9cd2ff", textDecoration: "underline" }} data-method="delete">
        Exit preview
      </a>
    </div>
  );
}

export function PreviewBar() {
  return (
    <Suspense fallback={null}>
      <PreviewBanner />
    </Suspense>
  );
}
