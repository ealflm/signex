import { requireRole } from "@/app/lib/session";
import { atLeast } from "@signex/shared";
import { listThemes, getActiveThemeId } from "@/app/lib/themes";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { ThemeCard } from "./theme-card";
import { Palette } from "lucide-react";

export default async function ThemesPage() {
  const user = await requireRole("EDITOR");
  const canPublish = atLeast(user.role, "PUBLISHER");

  const [themes, activeThemeId] = await Promise.all([
    listThemes(),
    getActiveThemeId(),
  ]);

  // Sort: live theme hoisted to top, then by updatedAt descending.
  const sorted = [...themes].sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const hasLive = themes.some((t) => t.isLive);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Themes"
        subtitle="Manage site themes. Publish a theme to make it live for visitors."
      />

      {/* No-live banner */}
      {!hasLive && themes.length > 0 && (
        <p
          role="status"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
        >
          No theme is currently live. Publish a theme to activate the site&apos;s
          appearance.
        </p>
      )}

      {/* API error / empty state */}
      {themes.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No themes yet."
          description="Themes will appear here once created."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              activeThemeId={activeThemeId}
              canPublish={canPublish}
            />
          ))}
        </div>
      )}
    </section>
  );
}
