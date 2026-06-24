import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@signex/db';
import type { Response } from 'express';

/**
 * Maps Prisma known-request errors to clean HTTP responses.
 *
 * Today the only mapping is **P2002 (unique-constraint violation) → 409
 * Conflict**, surfaced as a tidy `{ code: 'CONFLICT', message }` body. The
 * conflicting target columns are echoed back *only* when Prisma reports them as
 * a plain string array (column names — never row values), so no user data or
 * internal stack ever leaks.
 *
 * Everything else is intentionally left alone:
 *  - Nest `HttpException`s (e.g. the catalog's 409 `STALE_DRAFT`,
 *    422 `INVALID_INPUT`) are re-thrown verbatim so their status/body survive.
 *  - Other Prisma codes (P2025 "record not found", etc.) are re-thrown so the
 *    default exception handler keeps producing a 500 — we do NOT guess a status
 *    for codes we haven't deliberately mapped.
 *
 * Registered globally via `APP_FILTER` in `AppModule`.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    // Defensive: an HttpException should never reach a filter scoped to the
    // Prisma error class, but if Nest ever routes one here, pass it through
    // untouched so HttpException semantics are never swallowed.
    if (exception instanceof HttpException) {
      throw exception;
    }

    if (exception.code === 'P2002') {
      const target = extractTarget(exception);
      const message = target
        ? `A resource with this ${target} already exists`
        : 'Resource already exists';
      this.logger.warn(
        `P2002 unique-constraint violation${target ? ` on ${target}` : ''} → 409`,
      );

      const ctx = host.switchToHttp();
      const res = ctx.getResponse<Response>();
      const body = new ConflictException({
        code: 'CONFLICT',
        message,
      }).getResponse();
      res.status(409).json(body);
      return;
    }

    // Codes we haven't deliberately mapped: re-throw so the framework's default
    // handler responds (500). Do NOT invent a status for P2025 et al.
    throw exception;
  }
}

/**
 * Pull the conflicting column name(s) out of a P2002 error's `meta.target`,
 * but only when it is a string or string[] (Prisma reports column *names*
 * there). Returns `undefined` otherwise so we never echo arbitrary meta.
 */
function extractTarget(
  exception: Prisma.PrismaClientKnownRequestError,
): string | undefined {
  const target = exception.meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target) && target.every((t) => typeof t === 'string')) {
    return target.join(', ');
  }
  return undefined;
}
