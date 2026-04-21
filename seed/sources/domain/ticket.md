# チケット (Ticket)

## 定義

チケットは Tickflow の中核エンティティ。従業員の問い合わせ 1 件 = 1 チケット。

別名: 案件、問い合わせ、issue

## フィールド

| Field | Type | 説明 |
|---|---|---|
| id | UUID | 自動採番 |
| ticket_number | string | 表示用連番 `TF-00001` |
| title | string | 件名 (max 200 chars) |
| description | text | 本文 (Markdown) |
| status | enum | 状態 (下記) |
| priority | enum | 優先度 (P1/P2/P3) → `priority.md` 参照 |
| category | enum | カテゴリ → `category.md` 参照 |
| requester_id | UUID | 起票者 |
| assignee_id | UUID? | 対応者 (null = 未アサイン) |
| sla_deadline | timestamp? | SLA 期限 (priority × category で算出) |
| created_at | timestamp | 起票日時 |
| updated_at | timestamp | 最終更新 |
| resolved_at | timestamp? | 解決日時 |
| closed_at | timestamp? | クローズ日時 |

## 状態遷移

```
open → in_progress → resolved → closed
  │        │             ↑
  │        └─────────────┘ (reopen)
  └→ cancelled
```

- `open`: 起票直後。agent 未アサインまたはアサイン済みだが未着手
- `in_progress`: agent が対応開始。SLA タイマー稼働中
- `resolved`: agent が解決報告。requester の確認待ち
- `closed`: requester が解決を承認、または 5 営業日経過で自動クローズ
- `cancelled`: requester が取り消し

## 自動クローズ

`resolved` 状態で requester からの応答がなく 5 営業日経過した場合、バッチジョブ `auto-close-worker` が `closed` に遷移させる。
