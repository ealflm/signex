import { requireRole } from "@/app/lib/session";
import { atLeast } from "@signex/shared";
import { listThemes } from "@/app/lib/themes";
import { env } from "@/app/lib/env";
import { formatRelativeTime } from "@/app/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { LiveThemeBanner } from "./live-theme-banner";
import { ThemeCard } from "./theme-card";
import { NewThemeButton } from "./theme-dialogs";
import { Palette } from "lucide-react";

export default async function ThemesPage() {
  const user = await requireRole("EDITOR");
  const canPublish = atLeast(user.role, "PUBLISHER");

  const themes = await listThemes();

  const liveSiteUrl = (env().NEXT_PUBLIC_WEB_URL || "http://localhost:3062").replace(
    /\/+$/,
    "",
  );
  const host = liveSiteUrl.replace(/^https?:\/\//, "");

  const live = themes.find((t) => t.isLive) ?? null;
  const others = themes
    .filter((t) => !t.isLive)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        title="Themes"
        subtitle="Each theme is a saved version of your site content. Publish one to make it live for visitors. (The product catalog is site-wide — manage it on the Catalog page; catalog edits go live immediately.)"
        actions={<NewThemeButton themes={themes} />}
      />

      {themes.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No themes yet"
          description="A theme appears here once your site content is imported."
        />
      ) : (
        <>
          {/* Live spotlight — or a prompt to publish if nothing is live yet */}
          {live ? (
            <LiveThemeBanner
              theme={live}
              canPublish={canPublish}
              liveSiteUrl={liveSiteUrl}
              host={host}
              editedLabel={formatRelativeTime(live.updatedAt)}
            />
          ) : (
            <p
              role="status"
              className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning"
            >
              No version is live yet. Publish one to put your site online for
              visitors.
            </p>
          )}

          {/* Other versions */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {live ? "Other versions" : "All versions"}
            </h2>

            {others.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  Only one version so far
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Duplicate it to try changes safely — your live site stays
                  exactly as it is until you publish.
                </p>
                <div className="mt-2">
                  <NewThemeButton themes={themes} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {others.map((theme) => (
                  <ThemeCard
                    key={theme.id}
                    theme={theme}
                    canPublish={canPublish}
                    liveSiteUrl={liveSiteUrl}
                    editedLabel={formatRelativeTime(theme.updatedAt)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
