export type CustomType = "ingest" | "repair" | "batch" | "filing" | "lint";

export type Job =
  | { kind: "s3"; records: S3EventRecord[] }
  | { kind: "custom"; type: CustomType; payload: Record<string, unknown> };

export interface S3EventRecord {
  eventSource: string;
  eventName: string;
  s3: {
    bucket: { name: string };
    object: { key: string; size?: number; versionId?: string };
  };
}

const KNOWN_TYPES = new Set<CustomType>([
  "ingest",
  "repair",
  "batch",
  "filing",
  "lint",
]);

export function classify(raw: string): Job {
  const body = JSON.parse(raw);

  if (
    Array.isArray(body.Records) &&
    body.Records[0]?.eventSource === "aws:s3"
  ) {
    return { kind: "s3", records: body.Records as S3EventRecord[] };
  }

  if (typeof body.type === "string" && KNOWN_TYPES.has(body.type)) {
    return { kind: "custom", type: body.type as CustomType, payload: body };
  }

  throw new Error(`unclassifiable message: ${raw.slice(0, 200)}`);
}
