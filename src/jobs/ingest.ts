import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { runAgent } from "../shared/agent-sdk.ts";
import { readSourceMap } from "../shared/wiki-layout.ts";
import { contentHash } from "../shared/hash.ts";
import { loadSchema, type SchemaLoader } from "../shared/schema-cache.ts";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "ap-northeast-1" });
const SCHEMA_BUCKET = process.env.SCHEMA_BUCKET ?? "";

async function fetchS3Text(bucket: string, key: string): Promise<string> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return await res.Body!.transformToString();
}

const schemaLoader: SchemaLoader = {
  fetchFile: (key) => fetchS3Text(SCHEMA_BUCKET, key),
};

export async function handleIngest(bucket: string, key: string): Promise<void> {
  console.log(`[ingest] source: s3://${bucket}/${key}`);

  const sourceText = await fetchS3Text(bucket, key);
  const hash = contentHash(sourceText);

  const sourceMap = await readSourceMap();
  const existing = sourceMap.find((e) => e.key === key);
  if (existing?.hash === hash) {
    console.log(`[ingest] skip (hash unchanged): ${key}`);
    return;
  }

  const schema = await loadSchema(schemaLoader, SCHEMA_BUCKET || undefined);

  const sourcePayload = JSON.stringify({ key, content: sourceText });

  const prompt = `You are the LLM Wiki librarian. Your working directory is the wiki root (/mnt/wiki).

${schema ? `## Wiki Schema\n\n${schema}\n\n` : ""}## Task

A new source document has arrived. Integrate its content into the wiki following the schema rules.

The source is provided as a JSON object below (JSON-encoded to preserve any triple-backticks in the content):

${sourcePayload}

Parse the JSON to extract \`key\` and \`content\` fields.

Instructions:
1. Read entity-registry.json and index.md to understand existing wiki state
2. Create or update entity/topic pages as appropriate
3. Update entity-registry.json with any new entities or aliases
4. Update index.md and backlinks.md
5. Append to log.md
6. Update source-map.json (format: {"version":"1.0","sources":[{"key":"...","hash":"...","ingested_at":"...","affected_pages":["..."]}]}): add/update entry for "${key}" with hash "${hash}" and list of affected pages`;

  const result = await runAgent(prompt);
  console.log(`[ingest] done: turns=${result.numTurns} duration=${result.durationMs}ms cost=$${result.costUsd.toFixed(4)}`);
}
