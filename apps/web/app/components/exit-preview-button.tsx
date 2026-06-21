"use client";
// Leaf client island — issues DELETE /api/draft then navigates home so draft mode is cleared
// before the next page load. Kept separate so PreviewBanner (server component) stays a SC.
export function ExitPreviewButton() {
  return (
    <a
      href="#"
      style={{ color: "#9cd2ff", textDecoration: "underline" }}
      onClick={async (e) => {
        e.preventDefault();
        await fetch("/api/draft", { method: "DELETE" });
        window.location.href = "/";
      }}
    >
      Exit preview
    </a>
  );
}
