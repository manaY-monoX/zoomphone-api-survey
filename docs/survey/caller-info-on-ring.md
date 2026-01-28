# 電話がかかってきたタイミングで電話番号を取得

## 結論

✅ **可能** - `phone.callee_ringing` Webhookイベントで着信時に発信者の電話番号を取得できる。

## 実現方法

着信時（呼び出し中）に発火する `phone.callee_ringing` イベントをWebhookで受信し、`caller` オブジェクトから発信者情報を取得する。

## 必要な条件

- **OAuthアプリ**: OAuth App または Webhook Only App
- **OAuthスコープ**: `phone:read:admin`, `phone:write:admin`, `phone:read`, `phone:write`, `phone:master` のいずれか
- **イベント購読**: 「Callee phone is ringing」イベントを有効化
- **Webhook URL**: 公開エンドポイントが必要（ngrok等で開発環境にも対応可能）

## 実装例

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/WebhookHandler.ts:243-266` | 着信イベント処理 |
| `src/application/types/webhook.ts` | `CalleeRingingPayload` 型定義 |

### CLIコマンド

```bash
# Webhookサーバーを起動
npm run cli -- webhook

# ngrokでトンネル作成
ngrok http 3001

# Zoom Marketplaceで https://xxxx.ngrok.io/webhook を設定
```

### 取得できる発信者情報

`phone.callee_ringing` イベントの `caller` オブジェクト:

| フィールド | 説明 | 例 |
|-----------|------|-----|
| `phone_number` | 発信者電話番号（E164形式） | `"+12092592844"` |
| `connection_type` | 接続タイプ | `"voip"`, `"pstn_on_net"`, `"pstn_off_net"`, `"contact_center"`, `"byop"` |
| `name` | 発信者ユーザー名 | - |
| `extension_id` | 発信者内線ID | - |
| `extension_number` | 発信者内線番号 | - |
| `extension_type` | 内線タイプ | `"user"`, `"callQueue"`, `"autoReceptionist"`, `"commonArea"`, `"commonAreaPhone"` |
| `account_code` | 発信者アカウントコード | - |

### イベントペイロード例

```json
{
  "event": "phone.callee_ringing",
  "payload": {
    "account_id": "TQTvjT52Tmi_wrhASNNOEw",
    "object": {
      "call_id": "6998252113337041462",
      "caller": {
        "phone_number": "+12092592844",
        "connection_type": "voip"
      },
      "callee": {
        "extension_type": "user",
        "extension_number": 1002,
        "phone_number": "+12058945456",
        "user_id": "DnEopNmXQEGU2uvvzjgojw",
        "timezone": "America/Los_Angeles",
        "device_type": "MAC_Client(5.7.5.1123)",
        "device_id": "f7aLLSmqRpiWP0U3U6CaNA",
        "connection_type": "voip"
      },
      "ringing_start_time": "..."
    }
  }
}
```

### CTI連携の実装例

着信ポップアップ（CTI）機能を実装する場合:

```typescript
webhookHandler.onCalleeRinging(async (payload) => {
  const callerNumber = payload.caller?.phone_number;
  const callerName = payload.caller?.name;

  // CRMシステムから顧客情報を取得
  const customer = await crmService.findByPhoneNumber(callerNumber);

  // ポップアップ表示
  await notificationService.showIncomingCall({
    callerNumber,
    callerName: customer?.name || callerName || '不明',
    customerInfo: customer,
  });
});
```

## 注意点・制限事項

### Webhookイベント配信の問題

一部の環境で `phone.callee_ringing` がWebhook経由で配信されない問題が報告されている。

- [ZoomPhone webhook call events not received - Developer Forum](https://devforum.zoom.us/t/zoomphone-webhook-call-events-not-received/127224) (2025年3月)
- `phone.caller_ringing`, `phone.caller_connected`, `phone.caller_ended` が受信されない
- Zoom内部チケット作成済み（ZSEE-160985）だが未解決

**除外された原因**:
- Zoom Marketplaceでの購読設定漏れ → スクリーンショット確認済み
- 開発環境（ngrok）の問題 → `phone.callee_call_history_completed` は正常受信

### 代替手段（参考）

Webhookで問題が発生する場合、ZoomはWebSocket APIも提供している。WebSocket方式ではS2S OAuthアプリの作成が必要だが、公開URLなしでリアルタイムイベントを受信できる。

詳細は [Zoom WebSocket API Documentation](https://developers.zoom.us/docs/api/websockets/) を参照。

## 参考資料

- [Zoom Phone Webhook Events - callee_ringing](https://developers.zoom.us/docs/api/rest/reference/phone/events/#tag/Callee-Events/paths/phone.callee_ringing/post)
- [Zoom WebSocket API Documentation](https://developers.zoom.us/docs/api/websockets/)
