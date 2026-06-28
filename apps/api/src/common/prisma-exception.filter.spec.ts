import {
  ArgumentsHost,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@signex/db';
import { PrismaExceptionFilter } from './prisma-exception.filter';

/** Build a minimal ArgumentsHost whose response captures status/json. */
function mockHost() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

function p2002(
  target?: string | string[],
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('PrismaExceptionFilter', () => {
  const filter = new PrismaExceptionFilter();

  it('maps P2002 → 409 Conflict with a clean code/message and named target', () => {
    const { host, res } = mockHost();
    filter.catch(p2002(['slug']), host);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('CONFLICT');
    expect(body.message).toBe('A resource with this slug already exists');
    // No internal leak.
    expect(JSON.stringify(body)).not.toMatch(
      /Unique constraint|clientVersion|stack/i,
    );
  });

  it('maps P2002 with no usable target → generic 409 message', () => {
    const { host, res } = mockHost();
    filter.catch(p2002(undefined), host);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].message).toBe('Resource already exists');
  });

  it('joins multiple target columns', () => {
    const { host, res } = mockHost();
    filter.catch(p2002(['categoryId', 'slug']), host);
    expect(res.json.mock.calls[0][0].message).toBe(
      'A resource with this categoryId, slug already exists',
    );
  });

  it('maps P2025 → 404 Not Found with a clean code/message and no internal leak', () => {
    const { host, res } = mockHost();
    const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: 'test',
    });
    filter.catch(p2025, host);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Resource not found');
    expect(JSON.stringify(body)).not.toMatch(
      /Record not found|clientVersion|stack/i,
    );
  });

  it('re-throws Prisma codes we have NOT mapped (e.g. P2003) instead of guessing a status', () => {
    const { host, res } = mockHost();
    const p2003 = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint failed',
      { code: 'P2003', clientVersion: 'test' },
    );
    expect(() => filter.catch(p2003, host)).toThrow(p2003);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes Nest HttpExceptions through untouched (does not swallow them)', () => {
    const { host, res } = mockHost();
    const stale = new ConflictException({ code: 'STALE_DRAFT' });
    // Cast: the filter is defensively guarded against HttpExceptions reaching it.
    expect(() =>
      filter.catch(
        stale as unknown as Prisma.PrismaClientKnownRequestError,
        host,
      ),
    ).toThrow(stale);
    expect(res.status).not.toHaveBeenCalled();

    const notFound = new NotFoundException();
    expect(() =>
      filter.catch(
        notFound as unknown as Prisma.PrismaClientKnownRequestError,
        host,
      ),
    ).toThrow(notFound);
  });
});
