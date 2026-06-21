import { Injectable, Logger } from '@nestjs/common';

export interface RevalidatePayload {
  paths?: string[];
}

/**
 * RevalidationService
 *
 * API-side client for Next.js on-demand ISR revalidation.
 * POSTs `{ paths }` to `WEB_REVALIDATE_URL` with the `REVALIDATE_SECRET`
 * header (`x-revalidate-secret`).
 *
 * On any failure (network error, non-2xx) the payload is enqueued in an
 * IN-MEMORY retry queue. The queue is intentionally non-durable — it dies on
 * api restart. That is accepted: a durable outbox is a planned fast-follow.
 *
 * `revalidate()` NEVER throws — revalidation is non-fatal; a publish must not
 * be torn down by a momentarily unavailable web service.
 *
 * `reFire()` is the manual re-fire endpoint (Task 48 controller): it drains
 * the queue by re-attempting each payload and removes only the ones that now
 * succeed.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  /** In-memory retry queue. Non-durable; cleared on api restart. */
  private readonly queue: RevalidatePayload[] = [];

  pendingCount(): number {
    return this.queue.length;
  }

  private get url(): string {
    return process.env.WEB_REVALIDATE_URL ?? '';
  }

  private get secret(): string {
    return process.env.REVALIDATE_SECRET ?? '';
  }

  /** Fire-and-(soft-)forget. Never throws; queues for retry on failure. */
  async revalidate(input: RevalidatePayload): Promise<{ ok: boolean }> {
    const ok = await this.attempt(input);
    if (!ok) this.queue.push(input);
    return { ok };
  }

  /** Manual re-fire of every queued payload; drops the ones that now succeed. */
  async reFire(): Promise<{ drained: number }> {
    const pending = this.queue.splice(0, this.queue.length);
    let drained = 0;
    for (const payload of pending) {
      const ok = await this.attempt(payload);
      if (ok) drained += 1;
      else this.queue.push(payload);
    }
    return { drained };
  }

  private async attempt(input: RevalidatePayload): Promise<boolean> {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.secret,
        },
        body: JSON.stringify({ paths: input.paths ?? [] }),
      });
      if (!res.ok) {
        this.logger.warn(`revalidate non-2xx: ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`revalidate failed: ${(err as Error).message}`);
      return false;
    }
  }
}
