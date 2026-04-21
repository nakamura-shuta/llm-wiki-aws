# Tickflow — System Architecture

## Overview

Tickflow は社内ヘルプデスク SaaS。従業員（requester）が IT・総務・人事へチケットを起票し、対応者（agent）が処理する。管理者（admin）は SLA 遵守率や対応品質をダッシュボードで監視する。

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS |
| Backend API | Node.js 22 + Hono (REST) |
| Database | PostgreSQL 16 (RDS) |
| Cache / Queue | Redis 7 (ElastiCache) — session + background job queue |
| Search | OpenSearch 2.x — チケット全文検索 |
| File Storage | S3 — 添付ファイル |
| Auth | SAML SSO (社内 IdP 連携) + JWT |
| Hosting | ECS Fargate (ap-northeast-1) |
| IaC | AWS CDK v2 |

## High-Level Data Flow

```
requester → POST /api/tickets → API server
  → DB insert (status: open)
  → Redis queue (notification job)
  → webhook dispatch (外部連携)

agent → PATCH /api/tickets/:id → status transition
  → SLA timer check
  → auto-escalation evaluation
```

## Key Design Decisions

- **Single-tenant**: 1 社 1 環境。マルチテナント対応は Phase 2 以降
- **Stateless API**: JWT + Redis session。Fargate task 数を水平スケール可
- **SLA engine**: 営業時間ベースのカウントダウンタイマー。祝日マスタは DB テーブル管理
- **Audit log**: チケットの全変更を `ticket_events` テーブルに INSERT ONLY で記録
