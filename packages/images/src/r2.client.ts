import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** R2 is S3-compatible; reads `R2_*` env directly per call (same reasoning as the rest of this
 * package — see `gemini.client.ts`), so a client can always be built fresh from current env
 * rather than caching a possibly-stale one. */
function buildClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY must all be set');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket(): string {
  const name = process.env.R2_BUCKET;
  if (!name) throw new Error('R2_BUCKET is not set');
  return name;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await buildClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      // Covers are immutable once written — one image per story, ever.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export async function deleteObject(key: string): Promise<void> {
  await buildClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function listKeysWithPrefix(prefix: string): Promise<string[]> {
  const client = buildClient();
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: continuationToken }),
    );
    for (const obj of page.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);

  return keys;
}
