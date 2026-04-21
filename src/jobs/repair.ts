import { runAgent } from "../shared/agent-sdk.ts";
import { readWikiFile, writeWikiFile } from "../shared/wiki-layout.ts";
import { readdir } from "node:fs/promises";
import path from "node:path";

const WIKI = process.env.WIKI_MOUNT ?? "/mnt/wiki";

async function latestLintReport(): Promise<string | null> {
  const dir = path.join(WIKI, "_lint-reports");
  try {
    const files = await readdir(dir);
    const mds = files.filter((f) => f.endsWith(".md")).sort();
    if (mds.length === 0) return null;
    return `_lint-reports/${mds[mds.length - 1]}`;
  } catch {
    return null;
  }
}

async function appendRepairLog(entry: {
  reportPath: string;
  turns: number;
  durationMs: number;
  costUsd: number;
}): Promise<void> {
  const existing = (await readWikiFile("log.md")) ?? "# Wiki Log\n";
  const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const appended = `${existing.trimEnd()}

## ${ts} - Repair
- Report: ${entry.reportPath}
- Turns: ${entry.turns}
- Duration: ${(entry.durationMs / 1000).toFixed(1)}s
- Cost: $${entry.costUsd.toFixed(4)}
`;
  await writeWikiFile("log.md", appended);
}

export async function handleRepair(): Promise<void> {
  console.log(`[repair] starting`);

  const reportPath = await latestLintReport();
  if (!reportPath) {
    console.log(`[repair] no lint report found, run lint first`);
    return;
  }

  const report = await readWikiFile(reportPath);
  if (!report) {
    console.log(`[repair] lint report empty: ${reportPath}`);
    return;
  }

  console.log(`[repair] using lint report: ${reportPath}`);

  const prompt = `You are the LLM Wiki repair agent. Your working directory is the wiki root (/mnt/wiki).

## CRITICAL CONSTRAINT: Do NOT introduce new facts.

You may ONLY:
- Fix broken links (correct the path to match existing pages)
- Regenerate index.md and backlinks.md from current pages
- For conflicts: add a "## Conflicts Detected" section noting the contradiction, but do NOT resolve it by choosing one side
- For stale pages: if a changelog or newer source explicitly states a change, apply that specific change only
- For orphan pages: add appropriate backlinks from related pages

You MUST NOT:
- Invent information not present in any source or existing page
- Remove factual content
- Merge or rewrite pages beyond fixing the specific lint finding
- Add descriptive / explanatory sections that are not strictly required to fix a finding

## Lint Report

${report}

## Instructions

1. Read the lint report above
2. For each finding, apply the minimal fix following the constraints
3. Update index.md and backlinks.md after all fixes
4. Do NOT write to log.md — the runner will append the repair log entry automatically`;

  const result = await runAgent(prompt);
  console.log(`[repair] done: turns=${result.numTurns} duration=${result.durationMs}ms cost=$${result.costUsd.toFixed(4)}`);

  await appendRepairLog({
    reportPath,
    turns: result.numTurns,
    durationMs: result.durationMs,
    costUsd: result.costUsd,
  });
  console.log(`[repair] log.md appended`);
}
