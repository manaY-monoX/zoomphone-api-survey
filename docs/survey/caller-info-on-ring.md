# 電話がかかってきたタイミングで電話番号を取得

## 結論

✅ **可能** - `phone.callee_ringing` イベントで着信時に発信者の電話番号を取得できる。Webhook方式とWebSocket方式の両方で実現可能。

## 実現方法

着信時（呼び出し中）に発火する `phone.callee_ringing` イベントを受信し、`caller` オブジェクトから発信者情報を取得する。

### 推奨方式の選択

| ユースケース | 推奨方式 |
|------------|---------|
| クラウド環境（AWS/GCP/Azure）で公開URL提供可能 | **Webhook** |
| ローカル/社内環境で公開URL提供困難 | **WebSocket** |
| 既存のOAuthアプリを流用したい | **Webhook** |
| 新規にS2S OAuthアプリを作成可能 | **WebSocket** |

### 方式比較

| 項目 | Webhook (HTTP POST) | WebSocket |
|-----|---------------------|-----------|
| **配信方式** | Zoom → あなたのサーバー | あなた → Zoom (常時接続) |
| **公開URL** | **必須** (ngrok/ALB等) | **不要** |
| **認証** | OAuth (User-managed) | S2S OAuth **必須** |
| **セットアップ複雑さ** | 低 | 中（S2S OAuthアプリ作成） |
| **遅延** | 数百ms〜1秒程度 | 即時（常時接続） |
| **スケーラビリティ** | 高（Stateless） | 中（接続維持必要） |

## 必要な条件

### Webhook方式

- **OAuthアプリ**: OAuth App または Webhook Only App
- **OAuthスコープ**: `phone:read:admin`, `phone:write:admin`, `phone:read`, `phone:write`, `phone:master` のいずれか
- **イベント購読**: 「Callee phone is ringing」イベントを有効化
- **Webhook URL**: 公開エンドポイントが必要

### WebSocket方式

- **OAuthアプリ**: Server-to-Server OAuth App（S2S OAuth）
- **WebSocket購読**: Features > WebSocket subscription を有効化
- **イベント購読**: `phone.callee_ringing` を選択

## 実装例

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/WebhookHandler.ts:243-266` | Webhook版着信処理 |
| `src/application/services/WebSocketEventHandler.ts:219-243` | WebSocket版着信処理 |
| `src/application/types/webhook.ts` | `CalleeRingingPayload` 型定義 |
| `src/presentation/cli/index.ts:335-346` | CLI着信表示 |

### CLIコマンド

```bash
# Webhook方式
npm run cli -- webhook

# WebSocket方式
npm run cli -- websocket
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

## 注意点・制限事項

### Webhookイベント配信の問題

一部の環境で `phone.callee_ringing` がWebhook経由で配信されない問題が報告されている。

- [ZoomPhone webhook call events not received - Developer Forum](https://devforum.zoom.us/t/zoomphone-webhook-call-events-not-received/127224) (2025年3月)
- `phone.caller_ringing`, `phone.caller_connected`, `phone.caller_ended` が受信されない
- Zoom内部チケット作成済み（ZSEE-160985）だが未解決

**除外された原因**:
- Zoom Marketplaceでの購読設定漏れ → スクリーンショット確認済み
- 開発環境（ngrok）の問題 → `phone.callee_call_history_completed` は正常受信

**推奨対策**: Webhookで問題が発生する場合はWebSocket方式への切り替えを検討。

### WebSocket方式の注意点

- S2S OAuthアプリの作成が必要（User-managed OAuthとは別）
- 常時接続を維持する必要がある（Heartbeat 30秒ごと）
- 接続切断時の自動再接続処理が必要

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

## 参考資料

- [Zoom Phone Webhook Events - callee_ringing](https://developers.zoom.us/docs/api/rest/reference/phone/events/#tag/Callee-Events/paths/phone.callee_ringing/post)
- [Zoom WebSocket API Documentation](https://developers.zoom.us/docs/api/websockets/)
- [WebSocket JS Sample (GitHub)](https://github.com/zoom/websocket-js-sample)
- [S2S OAuthセットアップガイド](../setup/s2s-oauth-setup.md)
