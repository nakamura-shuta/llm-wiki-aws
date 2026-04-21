import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

export interface RetrievedPage {
  page_id: string;
  title: string;
  excerpt: string;
}

export interface QueryResult {
  answer: string;
  citations: string[];
  invalidCitations: string[];
  hasValidCitation: boolean;
  isInsufficient: boolean;
  usage: { input_tokens: number; output_tokens: number };
  durationMs: number;
}

const SYSTEM_PROMPT = `You are the LLM Wiki query assistant.

Rules (ABSOLUTE):
- Answer ONLY using the provided retrieved pages (given as JSON array).
- Every factual claim MUST have an inline citation in the form [[page:<page_id>]].
- <page_id> MUST be one of the ids listed in the retrieved array. Do NOT invent page ids.
- If retrieved context is insufficient, reply exactly: INSUFFICIENT_CONTEXT.
- Do NOT add background knowledge beyond the retrieved excerpts.
- Keep the answer under 300 words.`;

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
});

const MODEL_ID =
  process.env.ANTHROPIC_MODEL ?? "global.anthropic.claude-sonnet-4-6";

export async function queryBedrock(
  question: string,
  retrieved: RetrievedPage[],
): Promise<QueryResult> {
  const retrievedJson = JSON.stringify(
    retrieved.map((r) => ({
      page_id: r.page_id,
      title: r.title,
      excerpt: r.excerpt,
    })),
  );

  const userPrompt = `Retrieved pages:\n${retrievedJson}\n\nQuestion: ${question}`;

  const started = Date.now();

  const res = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    }),
  );

  const decoded = JSON.parse(new TextDecoder().decode(res.body));
  const answer = decoded.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  const allCitations = [
    ...answer.matchAll(/\[\[page:([a-z0-9_-]+)\]\]/g),
  ].map((m) => m[1]);

  const validIds = new Set(retrieved.map((r) => r.page_id));
  const citations = allCitations.filter((c) => validIds.has(c));
  const invalidCitations = allCitations.filter((c) => !validIds.has(c));

  return {
    answer,
    citations,
    invalidCitations,
    hasValidCitation: citations.length > 0,
    isInsufficient: answer.trim() === "INSUFFICIENT_CONTEXT",
    usage: {
      input_tokens: decoded.usage?.input_tokens ?? 0,
      output_tokens: decoded.usage?.output_tokens ?? 0,
    },
    durationMs: Date.now() - started,
  };
}
