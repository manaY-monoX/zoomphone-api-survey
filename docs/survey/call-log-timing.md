# 履歴が残るタイミング

## 結論

✅ **検知可能** - 通話履歴は通話終了後に作成され、Webhookイベントで検知できる。

## 実現方法

通話履歴の作成タイミングは `phone.callee_call_log_completed` Webhookイベントで検知する。

### 履歴作成のタイムライン

```
通話開始 → 履歴なし（取得不可）
    ↓
通話中 → 履歴なし（取得不可）
    ↓
通話終了 → phone.callee_ended イベント発火
    ↓
履歴作成 → phone.callee_call_log_completed イベント発火（終了直後）
    ↓
API取得可能 → GET /phone/call_history/{callLogId}
```

### 状態別の履歴取得可否

| 状態 | 履歴取得 | 備考 |
|-----|---------|------|
| 通話前 | ❌ 不可 | 履歴レコード未作成 |
| 通話中 | ❌ 不可 | 履歴レコード未作成 |
| 通話終了直後 | ✅ 可能 | Webhook発火後に取得可能 |

### 関連するWebhookイベント

| イベント | 発生タイミング | 説明 |
|---------|--------------|------|
| `phone.callee_ringing` | 通話中 | 着信開始（呼び出し中） |
| `phone.callee_answered` | 通話中 | 着信応答（通話開始） |
| `phone.callee_ended` | 通話終了時 | 着信者が通話終了 |
| `phone.callee_call_log_completed` | 通話終了後 | 履歴レコードが閲覧可能になったタイミング |
| `phone.recording_completed` | 録音完了後 | 録音ファイルが取得可能になったタイミング |

## 必要な条件

- **Webhook設定**: Zoom Marketplaceでイベント購読を有効化
- **購読イベント**: `phone.callee_call_log_completed`（または `phone.callee_call_history_completed`）
- **Webhook URL**: 公開エンドポイントが必要（ngrok等で開発環境にも対応可能）

## 実装例

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/WebhookHandler.ts:212-237` | 履歴完了イベント処理 |
| `src/infrastructure/server/WebhookServer.ts` | Webhookサーバー |

### CLIコマンド

```bash
# Webhookサーバーを起動（デフォルトポート: 3001）
npm run cli -- webhook

# ngrokでトンネル作成
ngrok http 3001

# Zoom Marketplaceで https://xxxx.ngrok.io/webhook を設定
```

### Webhookペイロード例

```json
{
  "event": "phone.callee_call_log_completed",
  "payload": {
    "account_id": "TQTvjT52Tmi_wrhASNNOEw",
    "object": {
      "call_log_id": "1234567890",
      "call_id": "6998252113337041462",
      "direction": "inbound",
      "duration": 120,
      "result": "answered",
      "caller_number": "+12092592844",
      "callee_number": "+12058945456"
    }
  }
}
```

## 注意点・制限事項

### API取得時の404エラー問題

Webhook `phone.callee_call_log_completed` 受信直後に詳細APIを呼び出すと、404 "Call Log does not exist" エラーが発生する場合がある。

**原因**: Zoomバックエンドでの非同期処理完了前にAPIを呼び出している

**推奨リトライ戦略**:

1. 初回: 即座に試行
2. 失敗時: 1秒待機 → 再試行
3. 継続失敗: 指数バックオフ（2s, 4s, 8s...）で最大5回
4. 最終失敗: ログ出力 + アラート

```typescript
async function getCallLogWithRetry(callLogId: string, maxRetries = 5): Promise<CallLog> {
  let delay = 1000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const result = await callHistoryService.getCallHistoryDetail(callLogId);

    if (result.success) {
      return result.data;
    }

    if (result.error.type === 'NOT_FOUND' && attempt < maxRetries - 1) {
      await sleep(delay);
      delay *= 2; // 指数バックオフ
      continue;
    }

    throw new Error(result.error.message);
  }
}
```

### Webhookイベント配信の問題

一部のリアルタイムイベント（`phone.callee_ringing`等）がWebhook経由で配信されない問題が報告されている。

- Zoom Developer Forumで複数報告あり
- Zoom内部チケット（ZSEE-160985）作成済みだが未解決
- 代替手段としてWebSocket APIの使用を推奨

詳細は [caller-info-on-ring.md](./caller-info-on-ring.md) を参照。

## 参考資料

- [Zoom Phone Webhook Events](https://developers.zoom.us/docs/api/rest/reference/phone/events/)
- [Call History API Not Working - Developer Forum](https://devforum.zoom.us/t/call-history-call-path-api-not-working-call-log-does-not-exist/108686)
- [Get Call Path API 404 Error - Developer Forum](https://devforum.zoom.us/t/get-call-path-returning-code-404-call-log-does-not-exist/100578)
