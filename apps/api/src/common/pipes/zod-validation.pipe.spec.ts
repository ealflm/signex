import { UnprocessableEntityException } from '@nestjs/common';
import { z } from '@signex/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ email: z.string().email(), n: z.number() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);
  const meta = { type: 'body' as const, metatype: undefined, data: undefined };

  it('returns the parsed value when valid', () => {
    const out = pipe.transform({ email: 'a@b.com', n: 1 }, meta);
    expect(out).toEqual({ email: 'a@b.com', n: 1 });
  });

  it('throws 422 with field errors when invalid', () => {
    try {
      pipe.transform({ email: 'nope', n: 'x' }, meta);
      fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(UnprocessableEntityException);
      const res = (e as UnprocessableEntityException).getResponse() as {
        errors: unknown[];
      };
      expect(Array.isArray(res.errors)).toBe(true);
      expect(res.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
