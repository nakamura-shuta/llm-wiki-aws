import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir: string;
let originalMount: string | undefined;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "wiki-retriever-"));
  originalMount = process.env.WIKI_MOUNT;
  process.env.WIKI_MOUNT = tmpDir;

  // minimal wiki fixture
  await mkdir(path.join(tmpDir, "entities"), { recursive: true });
  await mkdir(path.join(tmpDir, "topics"), { recursive: true });

  // ticket.md: intentionally place "## 状態遷移" section deep so filler > 10 non-heading lines
  // This catches regression of short-excerpt bug (previous impl took only first 10 lines).
  await writeFile(
    path.join(tmpDir, "entities", "ticket.md"),
    `# Ticket

## Overview

チケットは Tickflow の中核エンティティ。問い合わせ 1 件 = 1 チケット。別名: 案件、問い合わせ、issue。

## フィールド

| Field | Type | 説明 |
|---|---|---|
| id | UUID | 自動採番 |
| ticket_number | string | TF-00001 |
| title | string | 件名 |
| description | text | 本文 (Markdown) |
| status | enum | 状態 |
| priority | enum | 優先度 |
| category | enum | カテゴリ |
| requester_id | UUID | 起票者 |
| assignee_id | UUID? | 対応者 |
| sla_deadline | timestamp? | SLA 期限 |
| created_at | timestamp | 起票日時 |
| updated_at | timestamp | 最終更新 |

## 状態遷移

open → in_progress → resolved → closed
reopen: resolved → in_progress
cancelled: open → cancelled

- open: 起票直後
- in_progress: agent が対応開始
- resolved: agent が解決報告、requester 確認待ち
- closed: requester 承認または 5 営業日で自動クローズ
- cancelled: requester が取り消し

## References
- sources/domain/ticket.md
`,
  );

  await writeFile(
    path.join(tmpDir, "entities", "priority.md"),
    `# Priority\n\n## Overview\n\nPriority は P1/P2/P3 の 3 段階。\n\n## References\n- sources/domain/priority.md\n`,
  );

  await writeFile(
    path.join(tmpDir, "entity-registry.json"),
    JSON.stringify({
      version: "1.0",
      entities: [
        {
          id: "ticket",
          canonical: "Ticket",
          aliases: ["チケット", "案件", "問い合わせ", "issue"],
          type: "domain-concept",
          page: "entities/ticket.md",
        },
        {
          id: "priority",
          canonical: "Priority",
          aliases: ["優先度", "プライオリティ"],
          type: "domain-concept",
          page: "entities/priority.md",
        },
      ],
    }),
  );
});

afterAll(async () => {
  if (originalMount !== undefined) process.env.WIKI_MOUNT = originalMount;
  else delete process.env.WIKI_MOUNT;
  await rm(tmpDir, { recursive: true, force: true });
});

test("Japanese alias: チケットのステータス遷移を教えて → ticket page retrieved", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("チケットのステータス遷移を教えて");
  expect(results.length).toBeGreaterThan(0);
  expect(results.some((r) => r.page_id === "ticket")).toBe(true);
});

test("excerpt regression: ticket excerpt includes 状態遷移 section (not just head)", async () => {
  // Catches bug where excerpt only contained first 10 non-heading lines and
  // missed deeper sections. With EXCERPT_MAX=4000 and filler fields before,
  // a correct impl must include "open → in_progress → resolved → closed".
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("チケットのステータス遷移を教えて");
  const ticket = results.find((r) => r.page_id === "ticket");
  expect(ticket).toBeDefined();
  expect(ticket!.excerpt).toContain("open → in_progress → resolved → closed");
  expect(ticket!.excerpt).toContain("cancelled");
});

test("Japanese alias: 案件の状態遷移を教えて → ticket page retrieved (alias 展開)", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("案件の状態遷移を教えて");
  expect(results.some((r) => r.page_id === "ticket")).toBe(true);
});

test("English page id: what is the ticket status? → ticket retrieved", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("what is the ticket status?");
  expect(results.some((r) => r.page_id === "ticket")).toBe(true);
});

test("Multi-alias question: 優先度別のチケット SLA → priority + ticket both retrieved", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("優先度別のチケット SLA");
  expect(results.some((r) => r.page_id === "ticket")).toBe(true);
  expect(results.some((r) => r.page_id === "priority")).toBe(true);
});

test("Out of scope: パリの人口は何人？ → empty results", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("パリの人口は何人？");
  expect(results.length).toBe(0);
});

test("Empty question → empty results", async () => {
  const { retrieve } = await import("./retriever.ts");
  const results = await retrieve("");
  expect(results.length).toBe(0);
});
