# Naming Conventions

Wiki 全体のファイル名・ID・リンク規則。

## ファイル名

- **ケース**: kebab-case（ハイフン区切り小文字）
- **拡張子**: `.md` 固定（例外: `entity-registry.json`）
- **文字種**: ASCII のみ。日本語・スペース・アンダースコア禁止
- **例**:
  - ✅ `ticket.md`
  - ✅ `escalation-policy.md`
  - ❌ `Ticket.md`（大文字）
  - ❌ `エスカレーション.md`（日本語）

## Entity ID

`entity-registry.json` の `id` フィールド、および `entities/<id>.md` のファイル名。

- canonical name をローマ字化し、kebab-case に変換
- 略語は小文字化してそのまま使用可
- **例**:
  - "Ticket" → `ticket`
  - "Escalation Policy" → `escalation-policy`
  - "SLA" → `sla`

## Topic ID

`topics/<id>.md` のファイル名。

- ドメイン用語を kebab-case で
- **例**: `architecture.md`, `on-call.md`, `incident-response.md`, `deployment.md`

## Query ファイル名

`queries/<YYYY-MM-DD-HHMMSS>-<slug>.md`

- タイムスタンプは UTC
- slug は質問を簡略化した kebab-case
- **例**: `queries/2026-04-16-100000-p1-sla-definition.md`

## Lint レポートファイル名

`_lint-reports/<YYYY-MM-DD-HHMMSS>.md` — UTC タイムスタンプのみ。

## ページ内リンク

- **相対パス**: `[表示名](../entities/xxx.md)` のように相対で書く
- **絶対パス禁止**: `/entities/...` や `https://...` の内部参照は使わない
- **表示名**: エンティティの canonical name を使う
- **例**:
  - 同ディレクトリ内: `[Ticket](ticket.md)`
  - トピックからエンティティへ: `[Ticket](../entities/ticket.md)`

## ソース参照の書式

Ingest で追加された情報には出所を明記:

- インライン: `ダウンタイムは 95 分 (ref: raw/2026-04-incident-postmortem.md)`
- References セクション: プレーンなソースキーを箇条書き（Wiki内リンクを作らない）
  ```
  ## References
  - raw/domain/ticket.md
  - raw/ops/escalation.md
  ```

## 見出しレベル

- **H1**: ページタイトルのみ（1ページに1つ）
- **H2**: スキーマで定義されたセクション名
- **H3以降**: LLM の自由（内容のサブ構造）

## 禁止事項

- HTML タグの使用禁止（純粋な Markdown のみ）
- 画像埋め込みは非推奨（PoC では扱わない）
- フロントマター (`---` YAML ヘッダ) は使わない
