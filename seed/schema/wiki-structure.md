# Wiki Structure Rules

Wiki 全体の構造と、LLM が `cwd=/mnt/wiki` で Ingest/Lint を実行する際に守るべきルール。

## 全体のディレクトリ構造

```
wiki/
├── index.md                 # 全ページ索引（Ingest LLM が再生成）
├── backlinks.md             # 被参照マップ（Ingest LLM が再生成）
├── entity-registry.json     # エンティティ正規化情報（Ingest LLM が Read/Edit）
├── log.md                   # 処理履歴（Ingest/Lint LLM が追記）
├── entities/
│   └── <id>.md              # Ingest LLM が生成・更新
├── topics/
│   └── <id>.md              # Ingest LLM が生成・更新
├── queries/
│   └── <timestamp>-<slug>.md  # Query LLM が生成
└── _lint-reports/
    └── <timestamp>.md       # Lint LLM (mode:"lint") が生成
```

## `index.md` の生成ルール

全 entity / topic ページを列挙したマスター索引。**Ingest LLM が毎回再生成**。

### LLM への指示（Ingest プロンプト抜粋）

- `entities/` と `topics/` ディレクトリ直下の `.md` を Glob で列挙
- 各ファイルの H1 (`# `) を Read で読み、タイトルを取得
- カテゴリ別（Entities / Topics / Queries / Lint Reports）、アルファベット順で列挙
- 先頭に `Last updated: ...` を書く

### フォーマット

```markdown
# Wiki Index

Last updated: 2026-04-14 15:30:00 UTC

## Entities

- [Escalation Policy](entities/escalation-policy.md)
- [SLA](entities/sla.md)
- [Tickflow](entities/tickflow.md)
- [Ticket](entities/ticket.md)
- ...

## Topics

- [Architecture](topics/architecture.md)
- [On-Call](topics/on-call.md)
- [Incident Response](topics/incident-response.md)
- ...

## Queries

- [2026-04-16 Q: P1 SLA definition](queries/2026-04-16-100000-p1-sla-definition.md)
- ...

## Lint Reports

- [2026-04-14 15:30](_lint-reports/2026-04-14-153000.md)
- ...
```

## `backlinks.md` の生成ルール

全ページの被参照マップ。**Ingest LLM が毎回再生成**。

### LLM への指示

- Wiki 配下の全 `.md` を Grep で走査し `[...]( ...)` パターンを抽出
- 参照先 → 参照元のマップを構築
- 各参照先ごとに列挙
- 被参照0のページも `（なし）` として列挙（Lint で orphan 検出に使う）

### フォーマット

```markdown
# Backlinks

Last updated: 2026-04-14 15:30:00 UTC

## entities/ticket.md

被参照元:
- [topics/architecture.md](topics/architecture.md)
- [entities/sla.md](entities/sla.md)

## entities/escalation-policy.md

被参照元:
- [topics/on-call.md](topics/on-call.md)

## entities/isolated-entity.md

被参照元: （なし）  ← Lint で orphan として検出される

...
```

## `entity-registry.json` のスキーマ

```json
{
  "version": "1.0",
  "entities": [
    {
      "id": "ticket",
      "canonical": "Ticket",
      "aliases": ["チケット", "案件", "問い合わせ", "issue"],
      "type": "domain-concept",
      "page": "entities/ticket.md",
      "created_at": "2026-04-16T00:00:00Z",
      "updated_at": "2026-04-16T00:00:00Z"
    }
  ]
}
```

### 更新ルール（LLM が従う）

- Ingest LLM が Read で既存 `entities` 配列を読み、必要に応じて Edit で追加・更新
- 新規エンティティは末尾に追加、既存エンティティの alias 追加は該当エントリを Edit
- `id` は一度登録したら変更しない（ファイル名と連動するため）
- `canonical` は変更可能だが、変更時は該当ページの H1 も更新する必要がある
- `updated_at` は該当エンティティを変更した時のタイムスタンプ（LLM が ISO8601 で更新）

## `log.md` の追記ルール

### 追記形式

```markdown
# Wiki Log

## 2026-04-14 15:30:00 UTC - Ingest
- Source: raw/domain/ticket.md (versionId: xxx)
- Updated pages: entities/ticket.md, topics/architecture.md
- New entities: 1
- Conflicts: 0

## 2026-04-16 12:00:00 UTC - Lint
- Report: _lint-reports/2026-04-16-120000.md
- Conflicts: 1, Orphans: 0, Broken links: 0, Stale: 0
```

### 注意（LLM が守るべきルール）

- **追記のみ**（既存エントリの変更禁止）
- タイムスタンプは UTC、ISO8601 風に
- 古いエントリのアーカイブは PoC では行わない

## 初回実行時の扱い（Cold Start）

以下のファイルが存在しない場合、Ingest LLM はプロンプトに従って初期値を作成する:

| ファイル | 欠損時の扱い |
|---|---|
| `index.md` | LLM が新規作成（空の索引から） |
| `backlinks.md` | LLM が新規作成 |
| `entity-registry.json` | LLM が `{"version":"1.0","entities":[]}` で新規作成 |
| `log.md` | LLM が新規作成 |

初回 Ingest 完了後にこれらが初めて書き込まれる。
