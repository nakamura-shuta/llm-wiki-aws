import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { handleIngest } from "./ingest.ts";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-1" });

export async function handleBatch(bucket: string, prefix: string): Promise<void> {
  console.log(`[batch] listing s3://${bucket}/${prefix}`);

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key?.endsWith(".md")) keys.push(obj.Key);
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  console.log(`[batch] found ${keys.length} sources`);

  const failures: { key: string; error: string }[] = [];
  for (const key of keys.sort()) {
    try {
      await handleIngest(bucket, key);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[batch] failed on ${key}: ${msg}`);
      failures.push({ key, error: msg });
    }
  }

  console.log(`[batch] processed=${keys.length} failed=${failures.length}`);
  if (failures.length > 0) {
    throw new Error(`[batch] ${failures.length}/${keys.length} failed: ${failures.map((f) => f.key).join(", ")}`);
  }
}
