import { BadRequestException, Injectable } from '@nestjs/common';
import { siteConfigSchema, type SiteConfigInput } from '@signex/shared';
import type { AuthedUser } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RevalidationService } from '../revalidation/revalidation.service';

export interface SiteConfigView {
  /** GA4 measurement id; "" when unset → the web injects no Google Analytics. */
  ga4Id: string;
}

/**
 * SiteConfigService — the global, theme-independent site config singleton (id = "singleton").
 * Today it holds only GA4. Lives OUTSIDE the theme/snapshot model so analytics doesn't change
 * when a different theme is published.
 */
@Injectable()
export class SiteConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  /** Lazy-init + read the singleton (creates the row on first read). */
  async get(): Promise<SiteConfigView> {
    const cfg = await this.prisma.client.siteConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: {},
    });
    return { ga4Id: cfg.ga4Id ?? '' };
  }

  /**
   * Validate (siteConfigSchema → 400 on a bad GA4 id), upsert the singleton's ga4Id
   * (empty string → stored NULL), audit `siteconfig.update`, then fire a non-fatal
   * revalidation so the web's cached shell (tag 'release') picks up the new id.
   */
  async update(actor: AuthedUser, input: SiteConfigInput): Promise<SiteConfigView> {
    const parsed = siteConfigSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SITE_CONFIG',
        errors: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    // empty/whitespace → NULL (no analytics injected); otherwise the trimmed id.
    const ga4Id = parsed.data.ga4Id?.trim() ? parsed.data.ga4Id.trim() : null;

    const cfg = await this.prisma.client.$transaction(async (tx) => {
      const saved = await tx.siteConfig.upsert({
        where: { id: 'singleton' },
        create: { id: 'singleton', ga4Id },
        update: { ga4Id },
      });
      await this.audit.record(tx, {
        userId: actor.id,
        action: 'siteconfig.update',
        entityType: 'siteConfig',
        entityId: 'singleton',
        meta: { ga4Id },
      });
      return saved;
    });

    // AFTER commit — non-fatal (a momentarily-down web must not fail the save).
    await this.revalidation.revalidate({}).catch(() => undefined);

    return { ga4Id: cfg.ga4Id ?? '' };
  }
}
