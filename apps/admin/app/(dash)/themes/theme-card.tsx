import type { ThemeListItem } from "@/app/lib/themes";
import { Badge } from "@/components/ui/badge";
import { ThemeActions } from "./theme-actions";

interface ThemeCardProps {
  theme: ThemeListItem;
  /** This theme is the one the editor/preview currently targets. */
  isActive: boolean;
  canPublish: boolean;
  liveSiteUrl: string;
  /** Pre-formatted "Edited 2 hours ago" (computed server-side). */
  editedLabel: string;
}

/**
 * A draft version in the "Other versions" grid. Quieter than the live
 * spotlight: hero thumbnail, name, when it was last edited, and the shared
 * action cluster. No "Live" green here — that signal is reserved for the
 * spotlight so the published version stays unmistakable.
 */
export function ThemeCard({
  theme,
  isActive,
  canPublish,
  liveSiteUrl,
  editedLabel,
}: ThemeCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground transition-shadow hover:shadow-elevated">
      <div className="aspect-[16/9] w-full overflow-hidden border-b bg-muted">
        {theme.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external R2/MinIO host; thumbnail
          <img
            src={theme.heroImageUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10 text-3xl font-semibold text-muted-foreground/40">
            {theme.name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate text-base font-semibold leading-snug text-foreground">
              {theme.name}
            </h3>
            <p className="text-xs text-muted-foreground">Edited {editedLabel}</p>
          </div>
          {isActive && (
            <Badge variant="outline" title="Your edits target this version">
              Active
            </Badge>
          )}
        </div>

        {theme.dirty && (
          <span className="inline-flex w-fit items-center gap-1 text-xs font-medium text-warning">
            <span className="size-1.5 rounded-full bg-warning" />
            Unpublished changes
          </span>
        )}

        <div className="mt-auto pt-1">
          <ThemeActions
            theme={theme}
            canPublish={canPublish}
            liveSiteUrl={liveSiteUrl}
            variant="draft"
          />
        </div>
      </div>
    </div>
  );
}
