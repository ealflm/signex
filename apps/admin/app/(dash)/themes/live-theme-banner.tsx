import type { ThemeListItem } from "@/app/lib/themes";
import { ThemeActions } from "./theme-actions";

interface LiveThemeBannerProps {
  theme: ThemeListItem;
  canPublish: boolean;
  /** Absolute URL of the public site. */
  liveSiteUrl: string;
  /** liveSiteUrl without the protocol, e.g. "signex.vn". */
  host: string;
  /** Pre-formatted "Edited 2 hours ago" (computed server-side). */
  editedLabel: string;
}

/**
 * The "Live now" spotlight: the one published theme, given the weight it earns.
 * Wide hero on the left, status + actions on the right, a green pulse reserved
 * exclusively for "what visitors see right now".
 */
export function LiveThemeBanner({
  theme,
  canPublish,
  liveSiteUrl,
  host,
  editedLabel,
}: LiveThemeBannerProps) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-elevated">
      <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Hero — what the homepage actually looks like right now */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted sm:aspect-auto sm:min-h-[224px]">
          {theme.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external R2/MinIO host
            <img
              src={theme.heroImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10 text-5xl font-semibold text-muted-foreground/40">
              {theme.name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        {/* Status + actions */}
        <div className="flex flex-col justify-center gap-4 p-6">
          <div className="flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-2 text-xs font-semibold uppercase tracking-wide text-success">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/70" />
                <span className="relative inline-flex size-2 rounded-full bg-success" />
              </span>
              Live now
            </span>

            <h2 className="text-xl font-semibold leading-tight text-foreground">
              {theme.name}
            </h2>

            <p className="text-sm text-muted-foreground">
              Visitors see this version at{" "}
              <a
                href={liveSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {host}
              </a>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>Edited {editedLabel}</span>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">v{theme.lastPublishedRevision}</span>
            {theme.dirty && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                <span className="size-1.5 rounded-full bg-warning" />
                Unpublished changes
              </span>
            )}
          </div>

          <div className="pt-1">
            <ThemeActions
              theme={theme}
              canPublish={canPublish}
              liveSiteUrl={liveSiteUrl}
              variant="live"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
