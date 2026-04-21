import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { queryBedrock } from "./shared/bedrock-query.ts";
import { retrieve } from "./shared/retriever.ts";
import { contentHash, slugify } from "./shared/hash.ts";

const PORT = Number(process.env.PORT ?? 8080);
const BEARER_TOKEN = process.env.BEARER_TOKEN ?? "";
const QUEUE_URL = process.env.SQS_QUEUE_URL ?? "";
const REGION = process.env.AWS_REGION ?? "ap-northeast-1";

const sqs = new SQSClient({ region: REGION });

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function misconfigured(): Response {
  return new Response("BEARER_TOKEN not configured", { status: 503 });
}

function checkAuth(req: Request): boolean {
  return req.headers.get("authorization") === `Bearer ${BEARER_TOKEN}`;
}

async function enqueue(body: Record<string, unknown>): Promise<void> {
  await sqs.send(
    new SendMessageCommand({ QueueUrl: QUEUE_URL, MessageBody: JSON.stringify(body) }),
  );
}

async function handleQuery(req: Request): Promise<Response> {
  const { question, saveAnswer } = (await req.json()) as {
    question?: string;
    saveAnswer?: boolean;
  };

  if (!question || typeof question !== "string") {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const retrieved = await retrieve(question);

  if (retrieved.length === 0) {
    return Response.json({
      answer: "INSUFFICIENT_CONTEXT",
      citations: [],
      filing: null,
    });
  }

  const result = await queryBedrock(question, retrieved);

  let filing = null;
  if (saveAnswer !== false && result.hasValidCitation && !result.isInsufficient) {
    const hash = contentHash(result.answer);
    const slug = slugify(question);
    filing = { state: "enqueued", slug };

    await enqueue({
      type: "filing",
      question,
      answer: result.answer,
      citations: result.citations,
      hash,
      slug,
    });
  }

  return Response.json({
    answer: result.answer,
    citations: result.citations,
    invalidCitations: result.invalidCitations,
    isInsufficient: result.isInsufficient,
    filing,
    usage: result.usage,
    durationMs: result.durationMs,
  });
}

async function handleAdmin(path: string): Promise<Response> {
  switch (path) {
    case "/admin/lint":
      await enqueue({ type: "lint" });
      return Response.json({ status: "enqueued", type: "lint" });

    case "/admin/repair":
      await enqueue({ type: "repair" });
      return Response.json({ status: "enqueued", type: "repair" });

    case "/admin/batch-ingest": {
      await enqueue({
        type: "batch",
        bucket: process.env.RAW_BUCKET ?? "",
        prefix: "sources/",
      });
      return Response.json({ status: "enqueued", type: "batch" });
    }

    default:
      return new Response("Not Found", { status: 404 });
  }
}

Bun.serve({
  port: PORT,
  routes: {
    "/health": new Response("ok"),
  },
  async fetch(req) {
    const url = new URL(req.url);

    if (!BEARER_TOKEN) return misconfigured();
    if (!checkAuth(req)) return unauthorized();

    if (url.pathname === "/query" && req.method === "POST") {
      return handleQuery(req);
    }

    if (url.pathname.startsWith("/admin/") && req.method === "POST") {
      return handleAdmin(url.pathname);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[api] listening on :${PORT}`);
