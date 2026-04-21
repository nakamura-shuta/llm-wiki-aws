# Webhooks API

Tickflow は外部システム連携用の webhook を提供する。

## イベント一覧

| Event | トリガー |
|---|---|
| `ticket.created` | チケット起票 |
| `ticket.assigned` | agent アサイン |
| `ticket.status_changed` | ステータス遷移 |
| `ticket.priority_changed` | 優先度変更 |
| `ticket.commented` | コメント追加 |
| `ticket.sla_warning` | SLA 残り 15 分 |
| `ticket.sla_breached` | SLA 超過 |
| `ticket.resolved` | 解決 |
| `ticket.closed` | クローズ |

## Webhook 登録

```
POST /api/v1/webhooks
Authorization: Bearer <admin-token>
```

```json
{
  "url": "https://example.com/tickflow-hook",
  "events": ["ticket.created", "ticket.sla_breached"],
  "secret": "whsec_..."
}
```

## Payload 形式

```json
{
  "event": "ticket.status_changed",
  "timestamp": "2026-04-16T10:30:00Z",
  "data": {
    "ticket_id": "a1b2c3d4-...",
    "ticket_number": "TF-01234",
    "old_status": "open",
    "new_status": "in_progress",
    "actor_id": "agent-uuid-..."
  },
  "signature": "sha256=..."
}
```

## 署名検証

payload を `secret` で HMAC-SHA256 し、`X-Tickflow-Signature` ヘッダーと比較。

## リトライ

配信失敗時は 30 秒、2 分、10 分の 3 回リトライ。3 回失敗で webhook を自動無効化し、admin に通知。

## 主な連携先

- Slack: `ticket.created` / `ticket.sla_warning` を Slack channel に投稿
- PagerDuty: `ticket.sla_breached` で P1 のみ PagerDuty incident 作成
- Jira: `ticket.created` (category=IT-*) で Jira issue を同期作成
