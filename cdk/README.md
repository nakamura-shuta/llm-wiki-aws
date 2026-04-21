# LLM Wiki CDK (v2)

v2 仕様書 [`../.doc/SoW-v2.md`](../.doc/SoW-v2.md) に準拠した CDK Stack。Fargate + Bun + S3 Files + SQS Standard 構成。

## 前提

- **Node.js 22+** (CDK CLI は Node で動作。アプリ本体は Bun で `src/` 配下)
- AWS CLI (default profile)
- AWS Region: `ap-northeast-1`
- Bedrock で `global.anthropic.claude-sonnet-4-6` が使える状態
- Docker (ECR asset ビルド用)

## セットアップ

```bash
cd cdk
npm install
npx cdk bootstrap  # 初回のみ
```

## デプロイ

```bash
# 1. デプロイ（Docker image が ECR に push され、Fargate task が起動する）
npx cdk deploy LlmWikiV2Stack --require-approval never

# 2. Bearer token 取得（/query を叩く際に必要）
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name LlmWikiV2Stack --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BearerSecretArn`].OutputValue' \
  --output text)
TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" --region ap-northeast-1 \
  --query SecretString --output text)

# 3. ALB DNS 取得
ALB=$(aws cloudformation describe-stacks \
  --stack-name LlmWikiV2Stack --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' \
  --output text)

# 4. Schema + Raw データを S3 に投入（S3 event → SQS → worker で自動 ingest）
aws s3 sync ../seed/schema/  s3://schema-v2-<ACCOUNT_ID>/schema/
aws s3 sync ../seed/sources/ s3://raw-sources-v2-<ACCOUNT_ID>/sources/

# 5. Query
curl -X POST http://$ALB/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Tickflow の P1 SLA は何分以内？"}'

# 6. 管理 API（admin）— enqueue して worker が非同期実行
curl -X POST http://$ALB/admin/lint         -H "Authorization: Bearer $TOKEN"
curl -X POST http://$ALB/admin/repair       -H "Authorization: Bearer $TOKEN"
curl -X POST http://$ALB/admin/batch-ingest -H "Authorization: Bearer $TOKEN"
```

## Stack 構成

| リソース | 用途 |
|---|---|
| VPC (2 AZ) + NAT GW × 1 | ALB は 2 AZ 必須、NAT 1 個で cross-AZ コスト許容 |
| S3 × 3 (raw / wiki / schema) | 全て `versioned: true` (S3 Files 必須要件) |
| S3 Files FS + MountTarget × 2 + AccessPoint | Fargate に `/mnt/wiki` として NFS mount |
| SQS Standard + DLQ | `maxReceiveCount: 3`、S3 event 直結 |
| ECR + Fargate Task (ARM64, 1 vCPU / 2 GB) | `oven/bun:1.3.12`、api + worker 同居 (`wait -n`) |
| ALB (HTTP:80) | PoC。本番は HTTPS + ACM cert 切替 |
| Secrets Manager | Bearer token 自動生成、ECS secret injection |

## 片付け

```bash
npx cdk destroy LlmWikiV2Stack
```

NAT GW / Fargate / S3 Files FS / ALB は時間課金のため、検証後は destroy 推奨。

## 構成ファイル

- `bin/app.ts` — CDK エントリポイント
- `lib/llm-wiki-v2-stack.ts` — 単一 stack に全リソース定義

## 関連

- ルートの [README.md](../README.md) — Quick Start とディレクトリ構成
- [LICENSE](../LICENSE)
