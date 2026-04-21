import { readdir } from "node:fs/promises";
import { writeWikiFile, wikiPath, readWikiFile } from "../shared/wiki-layout.ts";
import { contentHash, slugify } from "../shared/hash.ts";

export interface FilingPayload {
  question: string;
  answer: string;
  citations: string[];
  hash: string; // answer hash (from api.ts)
  slug: string;
}

function validatePayload(raw: unknown): FilingPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("[filing] payload must be an object");
  }
  const p = raw as Record<string, unknown>;

  if (typeof p.question !== "string" || p.question.length === 0) {
    throw new Error("[filing] payload.question must be non-empty string");
  }
  if (typeof p.answer !== "string" || p.answer.length === 0) {
    throw new Error("[filing] payload.answer must be non-empty string");
  }
  if (!Array.isArray(p.citations) || !p.citations.every((c) => typeof c === "string")) {
    throw new Error("[filing] payload.citations must be string[]");
  }
  if (typeof p.hash !== "string") {
    throw new Error("[filing] payload.hash must be string");
  }

  const slug = typeof p.slug === "string" && p.slug.length > 0 ? p.slug : slugify(p.question);

  return {
    question: p.question,
    answer: p.answer,
    citations: p.citations as string[],
    hash: p.hash,
    slug,
  };
}

async function findExistingQuery(questionHash: string): Promise<string | null> {
  try {
    const files = await readdir(wikiPath("queries"));
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const content = await readWikiFile(`queries/${f}`);
      if (content && content.includes(`QuestionHash: ${questionHash}`)) {
        return `queries/${f}`;
      }
    }
  } catch {
    // queries/ not yet created
  }
  return null;
}

export async function handleFiling(raw: unknown): Promise<void> {
  const { question, answer, citations, hash: answerHash, slug } = validatePayload(raw);
  const questionHash = contentHash(question);

  const existing = await findExistingQuery(questionHash);
  if (existing) {
    console.log(`[filing] skip (duplicate question): existing=${existing}`);
    return;
  }

  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const filename = `queries/${ts}-${slug}.md`;

  const content = `# Q: ${question}

## Answer

${answer}

## Sources

${citations.map((c) => `- [[page:${c}]]`).join("\n")}

## Metadata

- Filed: ${new Date().toISOString()}
- QuestionHash: ${questionHash}
- AnswerHash: ${answerHash}
`;

  await writeWikiFile(filename, content);
  console.log(`[filing] written: ${filename}`);
}
