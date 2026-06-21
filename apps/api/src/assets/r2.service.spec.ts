import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { R2Service } from './r2.service';
import type { R2Config } from './r2.config';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/put'),
}));
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const cfg: R2Config = {
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'ak',
  secretAccessKey: 'sk',
  bucket: 'signex-media',
  publicBase: 'https://media.signex.test',
  presignTtlSeconds: 300,
};

const s3mock = mockClient(S3Client);

describe('R2Service', () => {
  let svc: R2Service;
  beforeEach(() => {
    s3mock.reset();
    (getSignedUrl as jest.Mock).mockClear();
    svc = new R2Service(cfg);
  });

  it('publicUrl joins base + key', () => {
    expect(svc.publicUrl('originals/abc/logo.svg')).toBe(
      'https://media.signex.test/originals/abc/logo.svg',
    );
  });

  it('presignPut returns url + required PUT headers incl checksum', async () => {
    const out = await svc.presignPut({
      r2Key: 'originals/abc/logo.png',
      mime: 'image/png',
      sha256: 'a'.repeat(64),
      maxBytes: 1000,
    });
    expect(out.url).toBe('https://signed.example/put');
    expect(out.expiresIn).toBe(300);
    expect(out.headers['Content-Type']).toBe('image/png');
    expect(out.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    // base64 of the hex sha256, for x-amz-checksum-sha256
    expect(out.headers['x-amz-checksum-sha256']).toBe(
      Buffer.from('a'.repeat(64), 'hex').toString('base64'),
    );
  });

  it('headObject returns size on found, null on 404', async () => {
    // Chain both behaviours upfront — aws-sdk-client-mock v4 resets the sinon stub when
    // .on(Command) is called a second time, so two separate .on() calls don't queue correctly.
    s3mock
      .on(HeadObjectCommand)
      .resolvesOnce({ ContentLength: 42, ContentType: 'image/png' })
      .rejectsOnce(
        Object.assign(new Error('not found'), { $metadata: { httpStatusCode: 404 } }),
      );
    expect(await svc.headObject('k')).toEqual({ contentLength: 42, contentType: 'image/png' });
    expect(await svc.headObject('missing')).toBeNull();
  });

  it('putObject sends a PutObjectCommand with cache header', async () => {
    s3mock.on(PutObjectCommand).resolves({});
    await svc.putObject({
      r2Key: 'k',
      body: Buffer.from('x'),
      mime: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const call = s3mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input).toMatchObject({
      Bucket: 'signex-media',
      Key: 'k',
      CacheControl: 'public, max-age=31536000, immutable',
      ContentType: 'image/png',
    });
  });

  it('getObjectBytes buffers the stream', async () => {
    s3mock.on(GetObjectCommand).resolves({ Body: Readable.from([Buffer.from('hello')]) as never });
    const buf = await svc.getObjectBytes('k');
    expect(buf.toString()).toBe('hello');
  });
});
