# インシデント対応手順

## 定義

Tickflow における「インシデント」は、P1 チケットのうち複数ユーザーに影響するもの、またはセキュリティ関連のもの。

## フロー

### 1. 検知

- requester からの起票（P1 / category: IT-SEC）
- 監視アラート（CloudWatch → PagerDuty → on-call agent）

### 2. 宣言

lead または admin が Slack `#incidents` チャンネルに incident 宣言を投稿。テンプレート:

```
🚨 Incident: [件名]
Priority: P1
Impact: [影響範囲]
Commander: [対応責任者]
Status: Investigating
```

### 3. 対応

- incident commander（通常は lead）が指揮
- 技術対応: agent が原因調査・復旧作業
- コミュニケーション: commander が 30 分ごとに `#incidents` に状況更新

### 4. 復旧

- サービス復旧確認後、commander が `Resolved` を宣言
- 関連チケットを一括で `resolved` に遷移

### 5. 振り返り (postmortem)

- 復旧から 3 営業日以内に postmortem ドキュメントを作成
- テンプレート: Timeline / Root Cause / Impact / Action Items
- 全 action item を Tickflow チケット（category: IT-SEC）として起票し追跡

## セキュリティインシデント特有ルール

- category `IT-SEC` のチケットは agent と lead のみ閲覧可（requester にも内容を制限）
- 添付ファイルの外部共有を禁止（presigned URL の有効期限を 10 分に短縮）
- 情シス部長への即時報告が必須
