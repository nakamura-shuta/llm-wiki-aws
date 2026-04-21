# カテゴリ (Category)

別名: 種別、type

## カテゴリ体系

Tickflow のチケットは 2 階層のカテゴリで分類される。

### L1 カテゴリ

| Code | 名称 | 対応チーム |
|---|---|---|
| IT | IT・システム | IT 部門 |
| GA | 総務・施設 | 総務部 |
| HR | 人事・労務 | 人事部 |

### L2 カテゴリ（IT の例）

| Code | 名称 | 説明 |
|---|---|---|
| IT-ACCT | アカウント | パスワードリセット、アクセス権限 |
| IT-HW | ハードウェア | PC 故障、モニター手配 |
| IT-SW | ソフトウェア | アプリインストール、ライセンス |
| IT-NW | ネットワーク | VPN、Wi-Fi、プロキシ |
| IT-SEC | セキュリティ | ウイルス検知、不審メール報告 |

### L2 カテゴリ（GA）

| Code | 名称 |
|---|---|
| GA-ROOM | 会議室・座席 |
| GA-SUPPLY | 備品・消耗品 |
| GA-FACILITY | 設備・ビル管理 |

### L2 カテゴリ（HR）

| Code | 名称 |
|---|---|
| HR-ATTENDANCE | 勤怠・休暇 |
| HR-PAYROLL | 給与・経費 |
| HR-ONBOARD | 入退社手続き |

## 自動カテゴリ推定

起票時の title + description を元に、OpenSearch の分類モデルが L1/L2 カテゴリを推定し、requester に提示する。requester が修正可能。
