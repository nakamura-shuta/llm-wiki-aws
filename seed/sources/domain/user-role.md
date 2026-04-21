# ユーザーロール (User Role)

## ロール一覧

| Role | 説明 | 権限 |
|---|---|---|
| requester | チケット起票者（全従業員） | 起票、自分のチケット閲覧、コメント追加、resolved → closed 承認 |
| agent | 対応者（IT 部門 / 総務 / 人事のメンバー） | チケットアサイン受け、ステータス変更、コメント、ナレッジ記事作成 |
| lead | チーム lead（agent の上位） | agent の全権限 + エスカレーション受け、agent へのアサイン振り分け、SLA レポート閲覧 |
| admin | システム管理者 | 全権限 + カテゴリ管理、SLA 設定変更、ユーザー管理、webhook 設定 |

## 認証

SAML SSO で社内 IdP と連携。ロールは IdP の group claim から自動マッピング:

- `helpdesk-requesters` → requester
- `helpdesk-agents` → agent
- `helpdesk-leads` → lead
- `helpdesk-admins` → admin

## VIP フラグ

admin が特定の requester に VIP フラグを付与可能。VIP のチケットは自動的に P2 以上に昇格される（`priority.md` 参照）。
