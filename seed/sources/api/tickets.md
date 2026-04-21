# Tickets API

Base URL: `https://tickflow.internal/api/v1`

## POST /tickets

チケット起票。

### Request

```json
{
  "title": "VPN に接続できない",
  "description": "今朝から GlobalProtect が接続エラーになる。エラーコード: GP-4012",
  "priority": "P2",
  "category": "IT-NW"
}
```

### Response (201)

```json
{
  "id": "a1b2c3d4-...",
  "ticket_number": "TF-01234",
  "status": "open",
  "priority": "P2",
  "category": "IT-NW",
  "requester_id": "...",
  "assignee_id": null,
  "sla_deadline": "2026-04-16T13:00:00+09:00",
  "created_at": "2026-04-16T09:00:00+09:00"
}
```

## GET /tickets/:id

チケット詳細取得。requester は自分のチケットのみ、agent/lead/admin は全件閲覧可。

## PATCH /tickets/:id

ステータス変更・フィールド更新。

### Request (例: agent がアサイン受けて対応開始)

```json
{
  "status": "in_progress",
  "assignee_id": "agent-uuid-..."
}
```

### ステータス遷移の検証

API はリクエストされた status 遷移が [`domain/ticket.md`](../domain/ticket.md) の状態遷移図に沿うかを検証し、不正な遷移は `400 Bad Request` で拒否する。優先度の定義は [`domain/priority.md`](../domain/priority.md)、カテゴリは [`domain/category.md`](../domain/category.md) を参照。

## GET /tickets

チケット一覧。フィルタ: `status`, `priority`, `category`, `assignee_id`, `requester_id`。ページネーション: cursor-based。

## POST /tickets/:id/comments

チケットにコメント追加。agent の最初のコメントが SLA の「初回応答」としてカウントされる。

## DELETE /tickets/:id

論理削除（`cancelled` への遷移）。requester 本人のみ可、`open` 状態のチケットに限る。
