# Tickflow AWS Architecture

## リージョン

ap-northeast-1 (Tokyo) のみ。DR は Phase 2 で大阪リージョンを検討。

## VPC 構成

```
VPC 10.0.0.0/16
├── Public subnet (10.0.1.0/24, 10.0.2.0/24) — ALB, NAT GW
├── Private subnet (10.0.10.0/24, 10.0.11.0/24) — ECS Fargate tasks
└── Isolated subnet (10.0.20.0/24, 10.0.21.0/24) — RDS, ElastiCache
```

Multi-AZ (ap-northeast-1a, 1c)。

## コンピュート

- ECS Fargate cluster `tickflow-prod`
- Service `tickflow-api`: desired 2, cpu=512, memory=1024, ALB target group
- Service `tickflow-worker`: desired 1, cpu=256, memory=512 (background job)
- Auto Scaling: CPU 70% で 2→4 task (api のみ)

## データストア

| サービス | 構成 |
|---|---|
| RDS PostgreSQL 16 | db.r6g.large, Multi-AZ, 100 GB gp3 |
| ElastiCache Redis 7 | cache.t4g.medium, cluster mode disabled, 1 replica |
| OpenSearch 2.x | t3.medium.search × 2, 50 GB EBS |
| S3 | `tickflow-attachments-{account}` (添付), `tickflow-backups-{account}` (DB dump) |

## ALB

- HTTPS (:443) + ACM certificate (`tickflow.internal.example.com`)
- HTTP → HTTPS リダイレクト
- WAF: rate limit (1000 req/min per IP), SQL injection rule set

## CI/CD

- GitHub Actions → ECR push → ECS rolling update (CodeDeploy blue/green は Phase 2)
- DB migration: Prisma migrate を ECS run-task で実行

## コスト概算（月額）

| 項目 | 概算 |
|---|---|
| ECS Fargate (api × 2 + worker × 1) | $80 |
| RDS Multi-AZ | $250 |
| ElastiCache | $60 |
| OpenSearch | $120 |
| ALB + NAT GW | $50 |
| S3 + data transfer | $10 |
| **合計** | **約 $570/月** |
