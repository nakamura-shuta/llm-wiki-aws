# LLM Wiki on AWS — PoC

Andrej Karpathy の [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) を AWS 上で実装した最小 PoC。**Fargate + Bun + S3 Files + SQS Standard + ALB** 構成の v2 のみを公開しています（v1 Lambda 版は別途検証済、本 repo の対象外）。

clone → `cdk deploy` → sample データを S3 にアップロード → curl で `/query` を叩く、までで LLM Wiki の動作確認ができます。

## 構成

| 要素 | 採用 |
|---|---|
| LLM 推論 | Bedrock (`global.anthropic.claude-sonnet-4-6`) |
| Query 経路 | `@aws-sdk/client-bedrock-runtime` の `InvokeModelCommand` 直叩き (1-shot + citation 強制) |
| Ingest / Repair / Lint | [`@anthropic-ai/claude-agent-sdk`](https://docs.claude.com/en/api/agent-sdk) on Bun |
| Runtime | Fargate + `oven/bun:1.3.12` (1 task で api + worker を `wait -n` 同居) |
| Wiki ストレージ | S3 Files (NFS mount `/mnt/wiki`) ※ bucket は versioning 必須 |
| イベント | S3 → SQS Standard 直結 + custom envelope (ingest/repair/batch/filing/lint) |
| 認証 | ALB + Bearer token (Secrets Manager 自動生成) ※ PoC は HTTP、本番は HTTPS |
| IaC | AWS CDK v2 (2.250+) |

## 実装された 5 種の custom job

- `ingest` — 単一 source を Wiki に統合（S3 Event or API 起動）
- `batch` — Raw バケット全件を一括取り込み
- `lint` — Wiki の健康診断（Conflicts / Orphan / Broken Links / Stale）
- `repair` — 最新 Lint レポートを入力に Wiki を自動修正（"no new facts" 制約）
- `filing` — Query 回答を deterministic に `queries/<slug>.md` として保存

## ディレクトリ構成

```
.
├── src/                                 # アプリ実装 (Bun + TypeScript)
│   ├── api.ts                           #   Bun.serve (/query, /admin/*)
│   ├── worker.ts                        #   SQS consumer + job dispatcher
│   ├── shared/                          #   sqs-envelope / bedrock-query / agent-sdk / retriever / wiki-layout / hash
│   └── jobs/                            #   ingest / repair / batch / filing / lint
├── Dockerfile                           # oven/bun:1.3.12 base
├── entrypoint.sh                        # api + worker を wait -n で同居
├── cdk/                                 # CDK プロジェクト (cdk/README.md 参照)
│   └── lib/llm-wiki-v2-stack.ts         #   VPC + S3 Files + SQS + ECS Fargate + ALB
├── seed/                                # サンプル題材「Tickflow」(架空の社内ヘルプデスク SaaS)
│   ├── schema/                          #   page-taxonomy / naming-conventions / wiki-structure
│   ├── sources/                         #   14 docs (domain/api/ops/infra/architecture)
│   └── incremental/                     #   2026-Q1 changelog (stale / repair 検証用)
└── LICENSE
```

## クイックスタート

### 1. 前提

- Node.js 22+ (CDK CLI 用)
- Bun 1.3.12+ (アプリ実行・ローカル test 用)
- AWS CLI (default profile に deploy 先アカウントの credential)
- Docker (ECR image ビルド用)
- AWS Region: `ap-northeast-1`
- Bedrock で `global.anthropic.claude-sonnet-4-6` にアクセスできる状態

### 2. Deploy

```bash
cd cdk
npm install
npx cdk bootstrap          # 初回のみ
npx cdk deploy LlmWikiV2Stack --require-approval never
```

### 3. Bearer token と ALB DNS を取得

```bash
SECRET_ARN=$(aws cloudformation describe-stacks \
  --stack-name LlmWikiV2Stack --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BearerSecretArn`].OutputValue' --output text)
export TOKEN=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ARN" --region ap-northeast-1 \
  --query SecretString --output text)
export ALB=$(aws cloudformation describe-stacks \
  --stack-name LlmWikiV2Stack --region ap-northeast-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' --output text)
```

### 4. Schema と Sample sources を S3 に投入（自動 Ingest が走る）

```bash
# ACCOUNT_ID はあなたのデプロイ先
aws s3 sync seed/schema/  s3://schema-v2-<ACCOUNT_ID>/schema/
aws s3 sync seed/sources/ s3://raw-sources-v2-<ACCOUNT_ID>/sources/
```

14 docs の ingest に合計 20〜25 分程度（1 doc あたり約 1.7 分、Agent SDK の multi-turn で）。進捗は CloudWatch Logs (`LlmWikiV2Stack-TaskLogs*`) で確認できます。

### 5. Query

```bash
curl -X POST http://$ALB/query \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question":"Tickflow の P1 SLA は何分以内？"}'
```

期待される出力は `[[page:sla]][[page:priority]]` 形式の引用付き回答。回答は `queries/<ts>-<slug>.md` として wiki bucket に自動保存（filing back）されます。

### 6. Incremental ingest → Lint → Repair

```bash
# 後から changelog を投入 (P1 SLA を 1h → 45min に短縮する宣言)
aws s3 cp seed/incremental/2026-Q1-changelog.md \
  s3://raw-sources-v2-<ACCOUNT_ID>/sources/changelog/2026-Q1-changelog.md

# Wiki の健康診断 (stale / conflict 検出)
curl -X POST http://$ALB/admin/lint   -H "Authorization: Bearer $TOKEN"

# Lint 結果を入力に、機械的に直せる部分だけ自動修正
curl -X POST http://$ALB/admin/repair -H "Authorization: Bearer $TOKEN"
```

再度 Query すると `45分以内` が反映されているはずです。

### 7. 片付け

```bash
cd cdk
npx cdk destroy LlmWikiV2Stack
```

NAT GW / Fargate / ALB / S3 Files FileSystem は時間課金です。検証後は destroy を推奨。

## 本番化で検討する項目 (PoC 対象外)

- Bearer token → IAM / Cognito 認証
- ALB HTTPS + ACM 証明書
- CloudWatch Alarms (DLQ depth / Fargate CPU / ALB 5xx)
- Bedrock VPC Endpoint で NAT GW コスト削減
- 監査ログ（filing は誰が、repair は何を直したか）
- 数百 entity 以上の場合の hierarchical index / sharded wiki

## License

[MIT](./LICENSE)

## References

- [Karpathy, "LLM Wiki" (Gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Anthropic - Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk)
- [AWS - S3 Files (NFS access to S3 buckets)](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html)
- [AWS - ECS Fargate + S3 Files volume](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/s3files-volumes.html)
- [AWS - Bedrock Inference Profiles](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles.html)
