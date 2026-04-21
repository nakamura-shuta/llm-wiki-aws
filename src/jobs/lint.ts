import { runAgent } from "../shared/agent-sdk.ts";

export async function handleLint(): Promise<void> {
  console.log(`[lint] starting wiki health check`);

  const prompt = `You are the LLM Wiki lint checker. Your working directory is the wiki root (/mnt/wiki).

## Task

Perform a comprehensive health check of the wiki and write a lint report.

1. Read index.md, entity-registry.json, and backlinks.md
2. Scan all entities/*.md and topics/*.md
3. Check for:
   - **Conflicts**: contradictory information between pages (different numbers, dates, or rules for the same concept)
   - **Orphan pages**: pages with no backlinks
   - **Broken links**: markdown links pointing to non-existent pages
   - **Stale pages**: pages whose information contradicts newer sources (check source-map.json timestamps)
   - **Duplicate entity candidates**: different entity-registry entries that might refer to the same thing

4. Write the report to _lint-reports/<YYYY-MM-DD-HHMMSS>.md using UTC timestamp
5. Append a log entry to log.md

Report format:
\`\`\`
# Lint Report - <timestamp>

## Conflicts
- [page1](path) vs [page2](path): description of contradiction

## Orphan Pages
- [page](path): no backlinks found

## Broken Links
- [source page](path): link to [target](broken-path) not found

## Stale Pages
- [page](path): may be outdated based on newer source (source-key, ingested at)

## Duplicate Entity Candidates
- "alias1" and "alias2" might refer to the same entity
\`\`\`

If a category has no findings, write "None found."`;

  const result = await runAgent(prompt);
  console.log(`[lint] done: turns=${result.numTurns} duration=${result.durationMs}ms cost=$${result.costUsd.toFixed(4)}`);
}
