# Wiki Page Taxonomy

このドキュメントは LLM Wiki の各ページ種類と必須/任意セクションを定義する。
Ingest / Lint の LLM はこの規約に従ってページを生成・更新する。

## ページ種類

### 1. Entity pages — `entities/<id>.md`

固有のモノを扱うページ。1エンティティ = 1ページ。

**対象**: ドメイン概念（チケット、SLA、優先度）、システムコンポーネント（APIサーバー、SQSキュー）、ポリシー（エスカレーションポリシー）、ロール（requester、agent）

**必須セクション**:
- `# <Canonical Name>` — H1タイトル（entity-registry.json の canonical と一致）
- `## Overview` — 1〜2段落のサマリ
- `## Details` — ソースから抽出した事実（箇条書きで可）
- `## References` — このページの情報を提供したソースのリスト

**任意セクション**:
- `## Timeline` — 時系列イベント
- `## Related` — 関連エンティティへのリンク
- `## Conflicts Detected` — 矛盾情報がある場合のみ（Lint が参照）

### 2. Topic pages — `topics/<id>.md`

横断的なテーマを扱うページ。複数エンティティにまたがる。

**対象**: アーキテクチャ、デプロイ手順、オンコール体制、インシデント対応、API 仕様、など

**必須セクション**:
- `# <Topic Title>` — H1タイトル
- `## Summary` — トピックの概要
- `## Entries` — 時系列 or 論点別のエントリ
- `## References` — 参照ソース一覧

**任意セクション**:
- `## Related Entities` — 関連エンティティへのリンク
- `## Conflicts Detected` — 矛盾情報

### 3. Query pages — `queries/<YYYY-MM-DD-HHMMSS>-<slug>.md`

Query Lambda が自動生成する Q&A ページ。

**必須セクション**:
- `# Q: <質問文>` — H1
- `## Answer` — 回答
- `## Sources` — 回答の根拠となった Wiki ページへのリンク

### 4. Lint reports — `_lint-reports/<YYYY-MM-DD-HHMMSS>.md`

Ingest Lambda の `mode:"lint"` が自動生成する健全性レポート。

**必須セクション**:
- `# Lint Report - <timestamp>`
- `## Conflicts` / `## Orphan Pages` / `## Broken Links` / `## Stale Pages` / `## Duplicate Entity Candidates`

## エンティティ type の分類

`entity-registry.json` の `type` フィールドに入れる値（LLM の裁量だが目安）:

- `domain-concept` — ドメイン概念（Ticket, SLA, Priority, Category）
- `system` — システム・アーキテクチャコンポーネント
- `policy` — ポリシー・ルール（エスカレーションポリシー、SLA 条件）
- `role` — ユーザーロール（requester, agent, lead, admin）
- `process` — 運用プロセス（デプロイ手順、インシデント対応フロー）
- `api` — API エンドポイント群
- `event` — 特定の出来事（インシデント、リリース等）

新しい type が必要なら LLM は自由に追加してよい（registry に記録される）。

## 判断の指針

- **1エンティティか、トピックか**: 「それ単体として語れる」なら entity、「複数のエンティティをまたいだテーマ」なら topic
- **新ページ作成 vs 既存更新**: 既存 entity-registry.json に登録済みの canonical/alias にヒットしたら既存ページを更新、しなければ新ページ作成
- **分割の判断**: 1ページが過度に長くなった（目安: 1500語超）場合、サブエンティティ or サブトピックに分割検討
