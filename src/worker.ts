import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from "@aws-sdk/client-sqs";
import { classify } from "./shared/sqs-envelope.ts";
import { handleIngest } from "./jobs/ingest.ts";
import { handleBatch } from "./jobs/batch.ts";
import { handleLint } from "./jobs/lint.ts";
import { handleRepair } from "./jobs/repair.ts";
import { handleFiling } from "./jobs/filing.ts";

const QUEUE_URL = process.env.SQS_QUEUE_URL ?? "";
const REGION = process.env.AWS_REGION ?? "ap-northeast-1";
const RAW_BUCKET = process.env.RAW_BUCKET ?? "";
const POLL_WAIT_SECONDS = 20;
const VISIBILITY_EXTEND_SEC = 600;

const sqs = new SQSClient({ region: REGION });

async function extendVisibility(receiptHandle: string): Promise<void> {
  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: VISIBILITY_EXTEND_SEC,
    }),
  );
}

async function dispatch(job: ReturnType<typeof classify>): Promise<void> {
  switch (job.kind) {
    case "s3": {
      const rec = job.records[0]!;
      await handleIngest(rec.s3.bucket.name, rec.s3.object.key);
      break;
    }
    case "custom":
      switch (job.type) {
        case "ingest": {
          const p = job.payload as { source_key?: string; bucket?: string };
          await handleIngest(p.bucket ?? RAW_BUCKET, p.source_key ?? "");
          break;
        }
        case "batch": {
          const p = job.payload as { bucket?: string; prefix?: string };
          await handleBatch(p.bucket ?? RAW_BUCKET, p.prefix ?? "sources/");
          break;
        }
        case "lint":
          await handleLint();
          break;
        case "repair":
          await handleRepair();
          break;
        case "filing":
          await handleFiling(job.payload);
          break;
      }
      break;
  }
}

async function poll(): Promise<void> {
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: POLL_WAIT_SECONDS,
      VisibilityTimeout: 300,
    }),
  );

  for (const msg of res.Messages ?? []) {
    if (!msg.Body || !msg.ReceiptHandle) continue;

    const job = classify(msg.Body);
    console.log(`[worker] job=${job.kind}${job.kind === "custom" ? `:${job.type}` : ""}`);

    const extendTimer = setInterval(
      () => extendVisibility(msg.ReceiptHandle!).catch(() => {}),
      (VISIBILITY_EXTEND_SEC / 2) * 1000,
    );

    try {
      await dispatch(job);
      await sqs.send(
        new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }),
      );
      console.log(`[worker] done, message deleted`);
    } finally {
      clearInterval(extendTimer);
    }
  }
}

console.log(`[worker] starting SQS poll loop (queue=${QUEUE_URL})`);

while (true) {
  try {
    await poll();
  } catch (e) {
    console.error(`[worker] error:`, (e as Error).message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
