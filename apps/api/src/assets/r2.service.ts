import { Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2_CONFIG, type R2Config } from './r2.config';

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function hexToBase64(hex: string): string {
  return Buffer.from(hex, 'hex').toString('base64');
}

@Injectable()
export class R2Service {
  private readonly s3: S3Client;

  constructor(@Inject(R2_CONFIG) private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: true,
    });
  }

  publicUrl(r2Key: string): string {
    return `${this.cfg.publicBase}/${r2Key}`;
  }

  async presignPut(args: {
    r2Key: string;
    mime: string;
    sha256: string;
    maxBytes: number;
  }): Promise<{ url: string; headers: Record<string, string>; expiresIn: number }> {
    const checksum = hexToBase64(args.sha256);
    const cmd = new PutObjectCommand({
      Bucket: this.cfg.bucket,
      Key: args.r2Key,
      ContentType: args.mime,
      CacheControl: IMMUTABLE_CACHE_CONTROL,
      ChecksumSHA256: checksum,
    });
    const url = await getSignedUrl(this.s3, cmd, {
      expiresIn: this.cfg.presignTtlSeconds,
      // The browser MUST echo these headers on PUT or R2 rejects the signature.
      signableHeaders: new Set(['content-type', 'cache-control', 'x-amz-checksum-sha256']),
    });
    return {
      url,
      headers: {
        'Content-Type': args.mime,
        'Cache-Control': IMMUTABLE_CACHE_CONTROL,
        'x-amz-checksum-sha256': checksum,
      },
      expiresIn: this.cfg.presignTtlSeconds,
    };
  }

  async putObject(args: {
    r2Key: string;
    body: Buffer;
    mime: string;
    cacheControl: string;
    checksumSha256?: string;
  }): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: args.r2Key,
        Body: args.body,
        ContentType: args.mime,
        CacheControl: args.cacheControl,
        ChecksumSHA256: args.checksumSha256,
      }),
    );
  }

  async headObject(
    r2Key: string,
  ): Promise<{ contentLength: number; contentType?: string } | null> {
    try {
      const res = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: r2Key }),
      );
      return { contentLength: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (err as { name?: string }).name === 'NotFound') {
        return null;
      }
      throw err;
    }
  }

  async getObjectBytes(r2Key: string): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: r2Key }),
    );
    const chunks: Buffer[] = [];
    const body = res.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
