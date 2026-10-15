import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config';

// Photos and report PDFs. local: a folder on the API server (dev). s3: Cloudflare R2 or any S3 bucket (private).
const s3 = config.storage.driver === 's3'
  ? new S3Client({
      region: config.storage.region,
      endpoint: config.storage.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: config.storage.accessKeyId, secretAccessKey: config.storage.secretAccessKey },
    })
  : null;

const localPath = (key: string) => {
  const p = path.resolve(config.storage.localDir, key);
  if (!p.startsWith(path.resolve(config.storage.localDir))) throw new Error('Bad storage key');
  return p;
};

export async function putFile(key: string, body: Buffer, contentType: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: config.storage.bucket, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

/** A short-lived signed URL (s3) or null when the API should stream the file itself (local). */
export async function signedUrl(key: string): Promise<string | null> {
  if (!s3) return null;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.storage.bucket, Key: key }), { expiresIn: 600 });
}

export async function readLocal(key: string): Promise<Buffer> {
  return readFile(localPath(key));
}
