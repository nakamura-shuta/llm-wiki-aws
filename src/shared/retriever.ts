import type { RetrievedPage } from "./bedrock-query.ts";
import { readEntityRegistry, listPages, readWikiFile, buildAliasMap } from "./wiki-layout.ts";

const TOP_K = Number(process.env.RETRIEVER_TOP_K ?? 5);
const EXCERPT_MAX = Number(process.env.RETRIEVER_EXCERPT_MAX ?? 4000);

interface ScoredPage {
  path: string;
  score: number;
}

function extractTitle(md: string): string {
  const match = md.match(/^#\s+(.+)/m);
  return match?.[1]?.trim() ?? "(untitled)";
}

function extractExcerpt(md: string): string {
  const body = md.trim();
  return body.length > EXCERPT_MAX ? body.slice(0, EXCERPT_MAX) + "\n...[truncated]" : body;
}

export async function retrieve(question: string): Promise<RetrievedPage[]> {
  const q = question.toLowerCase();
  if (q.length === 0) return [];

  const registry = await readEntityRegistry();
  const aliasMap = buildAliasMap(registry);

  const entityPages = await listPages("entities");
  const topicPages = await listPages("topics");
  const allPages = [...entityPages, ...topicPages];

  const pageScores = new Map<string, number>();
  const addScore = (pagePath: string, delta: number) => {
    pageScores.set(pagePath, (pageScores.get(pagePath) ?? 0) + delta);
  };

  // 1. page id substring match (English)
  for (const pagePath of allPages) {
    const pageId = pagePath.replace(/^(entities|topics)\//, "").replace(/\.md$/, "");
    if (pageId.length >= 3 && q.includes(pageId)) addScore(pagePath, 3);
  }

  // 2. alias substring match (Japanese / English, registered in entity-registry.json)
  for (const [alias, targetPage] of aliasMap) {
    if (alias.length >= 2 && q.includes(alias)) addScore(targetPage, 5);
  }

  const scored: ScoredPage[] = [...pageScores.entries()]
    .filter(([, score]) => score > 0)
    .map(([path, score]) => ({ path, score }));

  scored.sort((a, b) => b.score - a.score);
  const topPages = scored.slice(0, TOP_K);

  const results: RetrievedPage[] = [];
  for (const sp of topPages) {
    const content = await readWikiFile(sp.path);
    if (!content) continue;

    const pageId = sp.path.replace(/^(entities|topics)\//, "").replace(/\.md$/, "");
    results.push({
      page_id: pageId,
      title: extractTitle(content),
      excerpt: extractExcerpt(content),
    });
  }

  return results;
}
