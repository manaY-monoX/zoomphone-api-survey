# 電話履歴の取得

## 結論

✅ **可能** - REST APIで電話履歴（通話ログ）を取得できる。

## 実現方法

Zoom Phone APIの通話履歴エンドポイントを使用して、発着信履歴を取得する。

### 利用可能なエンドポイント

| エンドポイント | 用途 | 必要スコープ |
|---------------|------|-------------|
| `GET /phone/call_history` | アカウント全体の通話履歴（Admin） | `phone:read:admin` |
| `GET /phone/users/{userId}/call_history` | 特定ユーザーの通話履歴（Admin） | `phone:read:admin` |
| `GET /phone/users/me/call_logs` | 自分の通話履歴（User） | `phone:read:list_call_logs` |
| `GET /phone/users/me/call_logs/{callLogId}` | 通話詳細（User） | `phone:read:call_log` |

### POCで使用したエンドポイント

User-levelエンドポイント `/phone/users/me/call_logs` を使用。Admin権限（`:admin`スコープ）が不要で、個人の通話履歴を取得できる。

## 必要な条件

- **アカウントプラン**: Business または Enterprise
- **ライセンス**: Zoom Phone ライセンス
- **OAuthスコープ（User-level）**:
  - `phone:read:list_call_logs` - 一覧取得
  - `phone:read:call_log` - 詳細取得

## 実装例

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/CallHistoryService.ts` | 通話履歴取得サービス |
| `src/application/types/call-history.ts` | 型定義 |

### CLIコマンド

```bash
# 通話履歴一覧を取得
npm run cli -- history

# 特定期間の履歴を取得（ISO 8601形式）
npm run cli -- history --from 2026-01-01 --to 2026-01-31
```

### 取得できる情報

| フィールド | 説明 |
|-----------|------|
| `id` | 通話ログID |
| `call_id` | 通話ID |
| `caller_number` | 発信者電話番号 |
| `callee_number` | 着信者電話番号 |
| `direction` | 通話方向（`inbound`/`outbound`） |
| `duration` | 通話時間（秒） |
| `date_time` | 開始日時 |
| `call_end_time` | 終了日時 |
| `result` | 通話結果（`answered`, `missed`, `rejected`等） |
| `recording_id` | 録音ID（録音がある場合） |
| `recording_type` | 録音タイプ（`OnDemand`, `Automatic`） |

## 注意点・制限事項

### AdminエンドポイントとUserエンドポイントの違い

レスポンス構造に差異があるため、実装時に注意が必要。

| フィールド | Admin API | User API |
|-----------|-----------|----------|
| 終了時刻 | `end_date_time` | `call_end_time` |
| 録音有無 | `has_recording` (boolean) | `recording_id` + `recording_type` |

### ページネーション

- デフォルトで最大30件/ページ
- `next_page_token` を使用して次ページを取得
- Rate Limit回避のため、ページ間に500msの待機を推奨

### 履歴作成タイミング

通話履歴は通話終了後に作成される。通話中の取得は不可。

詳細は [call-log-timing.md](./call-log-timing.md) を参照。

## 参考資料

- [Zoom Phone API Reference - Call History](https://developers.zoom.us/docs/api/rest/reference/phone/methods/#operation/getPhoneCallHistory)
- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/)
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/)
