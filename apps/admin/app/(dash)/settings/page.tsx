import { requireRole } from "@/app/lib/session";
import { apiServer } from "@/app/lib/api";
import { atLeast } from "@signex/shared";
import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { SiteConfigForm } from "./site-config-form";

interface SiteConfig {
  ga4Id: string;
}

export default async function SettingsPage() {
  // EDITOR+ may VIEW settings; only ADMIN may SAVE (enforced again in the action + API).
  const user = await requireRole("EDITOR");
  const canEdit = atLeast(user.role, "ADMIN");

  const res = await apiServer<SiteConfig>("/api/site-config");
  const ga4Id = res.ok ? res.data.ga4Id : "";

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        subtitle="Site-wide configuration. These apply across every theme, independent of which one is published."
      />

      <SectionCard
        title="Analytics"
        description="Google Analytics 4 measurement ID. Injected on the live site only when set; it does not change when you publish a different theme."
      >
        {!canEdit && (
          <p className="mb-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            You can view these settings, but only an admin can change them.
          </p>
        )}
        <SiteConfigForm ga4Id={ga4Id} canEdit={canEdit} />
      </SectionCard>
    </section>
  );
}
