# Attachments API

チケットにファイルを添付するための API。

## POST /tickets/:id/attachments

### Request

`multipart/form-data` で送信。

| Field | Type | 制約 |
|---|---|---|
| file | binary | 最大 20 MB |
| filename | string | 元ファイル名 |

### 対応フォーマット

画像: png, jpg, gif, webp
文書: pdf, docx, xlsx, csv
ログ: txt, log, json
圧縮: zip (展開はしない)

### Response (201)

```json
{
  "id": "att-uuid-...",
  "ticket_id": "a1b2c3d4-...",
  "filename": "error-screenshot.png",
  "size_bytes": 245760,
  "content_type": "image/png",
  "download_url": "https://tickflow-attachments.s3.ap-northeast-1.amazonaws.com/...",
  "created_at": "2026-04-16T09:05:00+09:00"
}
```

### Storage

- S3 bucket `tickflow-attachments-{account}`
- key: `tickets/{ticket_id}/{attachment_id}/{filename}`
- presigned URL (有効期限 1 時間) を `download_url` として返す

### 制限

- 1 チケットあたり最大 10 ファイル
- 合計サイズ 100 MB 以下
- ウイルススキャン: アップロード時に ClamAV Lambda でスキャン、検出時は保存拒否 + requester に通知
