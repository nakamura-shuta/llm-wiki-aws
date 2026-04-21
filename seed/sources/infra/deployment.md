# デプロイ手順

## 通常デプロイ（API / Worker）

### 前提

- `main` ブランチへの merge が完了していること
- GitHub Actions の CI（lint + test + build）が green であること

### 手順

1. GitHub Actions の `deploy-prod` workflow を手動トリガー（`workflow_dispatch`）
2. ECR に新 image が push される (tag: `main-<sha>-<ts>`)
3. ECS service の task definition が新 image を参照する revision に更新
4. rolling update: `minimumHealthyPercent=100`, `maximumPercent=200`
5. ヘルスチェック (`/health`) が通った新 task が old task を置き換え
6. Slack `#deploy` に完了通知

### ロールバック

```bash
# 直前の task definition revision に戻す
aws ecs update-service \
  --cluster tickflow-prod \
  --service tickflow-api \
  --task-definition tickflow-api:<previous-revision> \
  --force-new-deployment
```

## DB マイグレーション

### 手順

1. Prisma の migration ファイルを PR で merge
2. `deploy-prod` workflow 内で `prisma migrate deploy` を ECS run-task として実行
3. migration 失敗時は自動ロールバック（Prisma の `--rollback-on-failure`）
4. **破壊的変更（カラム削除等）は 2 段階デプロイ**:
   - Phase A: 新カラム追加 + アプリが両方対応する版をデプロイ
   - Phase B: 旧カラム削除（1 週間以上の安全期間後）

## 緊急デプロイ (hotfix)

- `hotfix/*` ブランチから直接 `deploy-prod` を実行可能（lead 承認必須）
- CI の test suite は skip 不可（hotfix でもフル実行）
- デプロイ後 1 時間は Slack `#incidents` でモニタリング体制

## メンテナンスウィンドウ

- 毎月第 2 日曜 02:00-06:00 JST
- RDS の minor version upgrade、OS パッチ適用
- 計画メンテナンスは 1 週間前に全社メール + Tickflow のバナー通知
