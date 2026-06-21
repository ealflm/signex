import { Test } from '@nestjs/testing';
import { RevalidationService } from './revalidation.service';

describe('RevalidationService', () => {
  let service: RevalidationService;
  const realFetch = global.fetch;

  beforeEach(async () => {
    process.env.WEB_REVALIDATE_URL = 'http://web:3062/api/revalidate';
    process.env.REVALIDATE_SECRET = 's3cret';
    const moduleRef = await Test.createTestingModule({
      providers: [RevalidationService],
    }).compile();
    service = moduleRef.get(RevalidationService);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('POSTs paths with the secret header on success', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi', '/en'] });

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://web:3062/api/revalidate');
    expect(init.method).toBe('POST');
    expect(init.headers['x-revalidate-secret']).toBe('s3cret');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ paths: ['/vi', '/en'] });
  });

  it('queues for retry and resolves {ok:false} on a non-2xx response (never throws)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 401 } as Response) as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi'] });

    expect(res).toEqual({ ok: false });
    expect(service.pendingCount()).toBe(1);
  });

  it('queues for retry and resolves {ok:false} when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    const res = await service.revalidate({ paths: ['/vi'] });

    expect(res).toEqual({ ok: false });
    expect(service.pendingCount()).toBe(1);
  });

  it('reFire() drains queued payloads that now succeed', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ ok: true, status: 200 } as Response) as unknown as typeof fetch;

    await service.revalidate({ paths: ['/vi'] });
    expect(service.pendingCount()).toBe(1);

    const out = await service.reFire();

    expect(out).toEqual({ drained: 1 });
    expect(service.pendingCount()).toBe(0);
  });
});
