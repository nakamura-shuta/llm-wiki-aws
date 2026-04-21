# LLM Wiki on AWS

Andrej Karpathy の [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) を AWS 上で実装した PoC。**Fargate + Bun + S3 Files + SQS + ALB** 構成。

clone → `cdk deploy` → S3 にサンプルを投入 → `curl /query` で動作確認できます。

## 構成

- **LLM**: Bedrock (`global.anthropic.claude-sonnet-4-6`)
- **Query** は `@aws-sdk/client-bedrock-runtime` 直叩き (1-shot + citation 強制)
- **Ingest / Repair / Lint** は [`@anthropic-ai/claude-agent-sdk`](https://docs.claude.com/en/api/agent-sdk) で multi-turn 実行
- **Runtime**: Fargate + Bun 1.3.12 (1 task で api + worker を同居)
- **Wiki ストレージ**: S3 Files (NFS mount)、bucket は versioning 必須
- **イベント**: S3 → SQS Standard → worker
- **認証**: ALB + Bearer token (Secrets Manager)
- **IaC**: CDK v2

## 実装している job

| job | 役割 |
|---|---|
| `ingest`  | 単一 source を Wiki に統合 (S3 Event 起動) |
| `batch`   | Raw bucket 全件を一括取り込み |
| `lint`    | Conflicts / Orphan / Broken Links / Stale を検出 |
| `repair`  | Lint レポートを入力に機械的に修正 ("no new facts" 制約) |
| `filing`  | Query 回答を `queries/<slug>.md` として保存 |

## クイックスタート

**前提**: Node 22+ / Bun 1.3.12+ / AWS CLI / Docker / region `ap-northeast-1` / Bedrock で Sonnet 4.6 が有効。

### Deploy

```bash
cd cdk
npm install
npx cdk bootstrap          # 初回のみ
npx cdk deploy LlmWikiV2Stack --require-approval never
```

### Token / ALB DNS を取得

```bash
STACK=LlmWikiV2Stack REGION=ap-northeast-1
export TOKEN=$(aws secretsmanager get-secret-value --region $REGION \
  --secret-id $(aws cloudformation describe-stacks --stack-name $STACK --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`BearerSecretArn`].OutputValue' --output text) \
  --query SecretString --output text)
export ALB=$(aws cloudformation describe-stacks --stack-name $STACK --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`AlbDns`].OutputValue' --output text)
```

### Sample 投入 → Query

```bash
# <ACCOUNT_ID> は自分の AWS アカウント ID
aws s3 sync seed/schema/  s3://schema-v2-<ACCOUNT_ID>/schema/
aws s3 sync seed/sources/ s3://raw-sources-v2-<ACCOUNT_ID>/sources/
# 14 docs の ingest に 20〜25 分 (進捗は CloudWatch Logs の LlmWikiV2Stack-TaskLogs*)

curl -X POST http://$ALB/query \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question":"Tickflow の P1 SLA は何分以内？"}'
```

回答は `[[page:sla]][[page:priority]]` 形式の引用付きで返り、`queries/<ts>-<slug>.md` にも自動保存されます (filing back)。

### Incremental ingest → Lint → Repair

```bash
# changelog を追加で投入 (P1 SLA 1h → 45min)
aws s3 cp seed/incremental/2026-Q1-changelog.md \
  s3://raw-sources-v2-<ACCOUNT_ID>/sources/changelog/2026-Q1-changelog.md

curl -X POST http://$ALB/admin/lint   -H "Authorization: Bearer $TOKEN"
curl -X POST http://$ALB/admin/repair -H "Authorization: Bearer $TOKEN"
# 再 Query すると 45 分が反映される
```

### 片付け

```bash
cd cdk && npx cdk destroy LlmWikiV2Stack
```

NAT GW / Fargate / ALB / S3 Files は時間課金。検証後は destroy 推奨。

## License

[MIT](./LICENSE)

## References

- [Karpathy - LLM Wiki (Gist)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [Anthropic - Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk)
- [AWS - S3 Files](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-files.html)
- [AWS - ECS Fargate + S3 Files volume](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/s3files-volumes.html)
