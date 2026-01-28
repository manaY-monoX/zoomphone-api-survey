# Zoom Phone API 技術調査結果

調査対象:
- developers.zoom.us
- marketplace.zoom.us

---

## 調査項目別ドキュメント（詳細）

各調査項目の詳細は個別ドキュメントを参照:

| ドキュメント | 調査事項 | 結果 |
|-------------|---------|------|
| [call-history.md](./call-history.md) | 電話履歴の取得 | ✅ 可能 |
| [recording-download.md](./recording-download.md) | 履歴から音声データの取得 | ✅ 可能 |
| [realtime-streaming.md](./realtime-streaming.md) | リアルタイム音声・文字起こし取得 | ❌ 不可 |
| [call-log-timing.md](./call-log-timing.md) | 履歴が残るタイミング | ✅ 検知可能 |
| [caller-info-on-ring.md](./caller-info-on-ring.md) | 着信時の電話番号取得 | ✅ 可能 |

---

## 1. 電話履歴の取得 ✅ 可能
エンドポイント:

- GET /phone/call_history - アカウント全体の通話履歴を取得
- GET /phone/users/{userId}/call_history - 特定ユーザーの通話履歴を取得
- GET /phone/call_logs - 通話ログ（旧バージョン）を取得

### 必要な条件:

- Business または Enterprise アカウント
- Zoom Phone ライセンス
- 必要なスコープ: phone:read:admin, phone_call_log:read:admin

### 取得できる情報:

- 通話日時（開始・終了）
- 通話時間
- 発着信の方向（inbound/outbound）
- 通話結果（answered, missed, rejected等）
- 録音の有無
- 通話の種類（general, emergency等）

## 2. 音声データ（録音）の取得 ✅ 可能
エンドポイント:

- GET /phone/recordings - 録音一覧を取得
- GET /phone/recording/download/{fileId} - 録音ファイルをダウンロード
- GET /phone/recording_transcript/download/{recordingId} - 文字起こしをダウンロード
- GET /phone/users/{userId}/recordings - 特定ユーザーの録音を取得

### 必要な条件:

- Pro 以上のアカウントプラン
- Zoom Phone ライセンス
- 必要なスコープ: phone:read:admin, phone_recording:read:admin

### 注意点:

- 録音機能はZoom Phone管理者が有効化する必要がある
- 録音の取得は通話終了後のみ可能


## 3. リアルタイム音声ストリーミング ❌ 現時点では非対応
調査結果:

- Realtime Media Streams (RTMS) という機能がZoomに存在するが、対象は「Zoom Meetings」と「Video SDK」のみ
- Zoom Phoneでのリアルタイム音声ストリーミングはサポートされていない

### 代替手段:

- Webhooksを使用して通話イベント（発信、着信、応答、終了など）のリアルタイム通知は取得可能
ただし、音声データ自体のリアルタイムストリーミングは不可


## 4. 履歴が残るタイミング ✅ 取得可能
- 結論: 履歴は通話終了後に作成される

### Webhookイベントで検知可能:

| イベント | 発生タイミング | 説明 |
|---------|--------------|------|
| `phone.callee_ringing` | 通話中 | 着信開始（呼び出し中） |
| `phone.callee_answered` | 通話中 | 着信応答（通話開始） |
| `phone.callee_ended` | 通話終了時 | 着信者が通話終了 |
| `phone.callee_call_log_completed` | 通話終了後 | 履歴レコードが閲覧可能になったタイミング |
| `phone.recording_completed` | 録音完了後 | 録音ファイルが取得可能になったタイミング |

タイミングの流れ:

通話開始 → phone.callee_ringing / phone.callee_answered
通話終了 → phone.callee_ended
履歴作成 → phone.callee_call_log_completed（終了直後）
録音完了 → phone.recording_completed（処理完了後）

### 4.1 通話履歴の作成タイミング（詳細）

**結論: 通話履歴は通話終了後に作成される。通話中の取得は不可。**

| 状態 | 履歴取得 | 備考 |
|-----|---------|------|
| 通話前 | ❌ 不可 | 履歴レコード未作成 |
| 通話中 | ❌ 不可 | 履歴レコード未作成 |
| 通話終了直後 | ✅ 可能 | Webhook発火後に取得可能 |

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

#### 注意: API取得時の404エラー問題

Webhook `phone.callee_call_log_completed` 受信直後に詳細APIを呼び出すと、
404 "Call Log does not exist" エラーが発生する場合がある（開発者フォーラムで複数報告あり）。

**原因:** Zoomバックエンドでの非同期処理完了前にAPIを呼び出している

**推奨リトライ戦略:**
1. 初回: 即座に試行
2. 失敗時: 1秒待機 → 再試行
3. 継続失敗: 指数バックオフ（2s, 4s, 8s...）で最大5回
4. 最終失敗: ログ出力 + アラート

**参考情報:**
- [Call History API Not Working](https://devforum.zoom.us/t/call-history-call-path-api-not-working-call-log-does-not-exist/108686)
- [Get Call Path API 404 Error](https://devforum.zoom.us/t/get-call-path-returning-code-404-call-log-does-not-exist/100578)


## 5. POC実装検証結果 ✅ 完了

### 5.1 ユーザーレベルAPIエンドポイント

Admin権限（:admin スコープ）が必要なエンドポイントではなく、ユーザーレベルのエンドポイントで検証を実施。

| API | Admin エンドポイント | User エンドポイント | 検証結果 |
|-----|---------------------|-------------------|---------|
| 通話履歴 | GET /phone/call_history | GET /phone/users/me/call_logs | ✅ 成功 |
| 録音一覧 | GET /phone/recordings | GET /phone/users/me/recordings | ✅ 成功 |
| 録音ダウンロード | GET /phone/recording/download/{key} | 同左 | ✅ 成功 |

### 5.2 必要なOAuthスコープ（ユーザーレベル）

```
phone:read:list_call_logs
phone:read:call_log
phone:read:list_recordings
phone:read:call_recording
```

### 5.3 APIレスポンス構造の差異

User-levelエンドポイントとAdmin-levelエンドポイントでレスポンス構造に差異がある。

**通話履歴 (`/phone/users/me/call_logs`)**:
| フィールド | Admin API | User API |
|-----------|-----------|----------|
| 終了時刻 | `end_date_time` | `call_end_time` |
| 録音有無 | `has_recording` | `recording_id` + `recording_type` (録音ありの場合) |

**録音一覧 (`/phone/users/me/recordings`)**:
| フィールド | Admin API | User API |
|-----------|-----------|----------|
| 終了時刻 | `end_date_time` | `end_time` |
| ファイルタイプ | `file_type` | 含まれない |
| ファイルサイズ | `file_size` | 含まれない |

### 5.4 録音ダウンロード検証結果（2026-01-26）

| 項目 | 結果 |
|-----|------|
| 手動録音（OnDemand） | ✅ 取得・ダウンロード成功 |
| ファイル形式 | audio/mpeg (MP3) |
| 録音品質 | 128 kbps, 16 kHz, Monaural |
| ファイルサイズ | 約226 KB (14秒の録音) |

### 5.5 Zoom Phone録音設定

録音機能を使用するには、以下の設定が必要：

1. **自動録音の有効化**
   - Admin Portal > Phone System Management > Users & Rooms > Policy
   - 「Automatic Call Recording」を有効化

2. **録音アクセス権限の付与**
   - Policy > Automatic Call Recording > Access Member List
   - ユーザーを追加し「Download」権限を付与

3. **手動録音の場合**
   - 通話中に録音ボタンを押して開始
   - 録音タイプは `OnDemand` として記録される


## 6. リアルタイム機能調査（2026-01-26 追加調査）

### 6.1 リアルタイム音声ストリーミング ❌ 不可

Zoom Phone では通話中の音声をリアルタイムに取得する公式な方法は存在しない。

| 方法 | 対応状況 | 備考 |
|-----|---------|------|
| RTMS (Realtime Media Streams) | ❌ 非対応 | Meetings/Video SDK 専用 |
| RTMP ストリーミング | ❌ 非対応 | Meetings/Webinar 専用 |
| Video SDK | ❌ 非対応 | Phone との統合なし |
| SIP トランキング | ❌ 不可 | 音声キャプチャ機能なし |
| サードパーティ (Recall.ai等) | ❌ 非対応 | Meeting Bot 方式、Phone 非対応 |

### 6.2 リアルタイム文字起こし ❌ 不可

- Live Transcription API は Zoom Phone 非対応
- Zoom Phone UI では Live Transcription 機能があるが、API として公開されていない
- Zoom Contact Center でも同様の制限あり

### 6.3 Webhook でのリアルタイム実現 ⚠️ 部分的

**利用可能なイベント:**
- `phone.callee_ringing` - 着信開始通知
- `phone.callee_answered` - 通話開始通知
- `phone.callee_ended` - 通話終了通知
- `phone.recording_completed` - 録音完了通知
- `phone.recording_transcript_completed` - 文字起こし完了通知

**制限:**
- Webhook は「イベント通知」のみで、音声データ・文字起こしテキストは含まれない
- 実際のデータ取得には REST API 呼び出しが必要

### 6.4 実現可能な代替案（準リアルタイム）

真の「リアルタイム」は実現不可。通話終了後に録音をダウンロードし、外部STTサービス（Whisper、Google Speech-to-Text等）で文字起こしを行う方式のみ可能。

**推定遅延:**
- 最短: 30秒〜数分（録音処理完了後）
- 最長: 最大24時間（Zoom側の処理状況による）


## 7. Webhookリアルタイムイベント配信問題（2026-01-27 調査）

### 7.1 問題の概要

CTI着信ポップアップ機能の実現に必要な `phone.callee_ringing` 等のリアルタイム通話イベントが、Webhook経由で配信されない問題を調査。

### 7.2 調査結果

| イベント | 公式ドキュメント | POC検証結果 | 備考 |
|---------|---------------|-------------|------|
| `phone.callee_ringing` | ✅ 記載あり | ❌ 未受信 | Zoom側の問題の可能性 |
| `phone.callee_incoming_call` | ❌ 存在しない | - | 誤情報（公式ドキュメントに記載なし） |
| `phone.callee_missed` | ✅ 記載あり | 未テスト | 不在着信時に発火 |
| `phone.callee_call_history_completed` | ✅ 記載あり | ✅ 受信成功 | 通話終了後に確定 |

### 7.3 原因分析

**Zoom Developer Forum で同様の問題が報告されている:**

- [ZoomPhone webhook call events not received](https://devforum.zoom.us/t/zoomphone-webhook-call-events-not-received/127224) (2025年3月)
- `phone.caller_ringing`, `phone.caller_connected`, `phone.caller_ended` が受信されない
- Zoom内部チケット作成済み（ZSEE-160985）だが未解決

**除外された原因:**
- ~~Zoom Marketplaceでの購読設定漏れ~~ → スクリーンショット確認済み
- ~~開発環境（ngrok）の問題~~ → `phone.callee_call_history_completed` は正常受信

### 7.4 WebSocket API による代替アプローチ

Webhookの問題を回避するため、WebSocket APIでのリアルタイムイベント受信を実装。

**技術仕様:**
- エンドポイント: `wss://ws.zoom.us/ws`
- 認証: OAuth 2.0 client_credentials フロー（アクセストークン）
- Heartbeat: 30秒ごとに `{ "module": "heartbeat" }` 送信
- 参考: [zoom/websocket-js-sample](https://github.com/zoom/websocket-js-sample)

**実装ファイル:**
| ファイル | 説明 |
|---------|------|
| `src/infrastructure/websocket/ZoomWebSocketClient.ts` | WebSocket接続クライアント |
| `src/application/services/WebSocketEventHandler.ts` | イベントハンドラー |
| `src/config/index.ts` | WebSocket設定追加 |

**使用方法:**
```bash
npm run cli -- websocket
```

### 7.5 検証ステータス

| 項目 | 状態 | 備考 |
|-----|------|------|
| WebSocketクライアント実装 | ✅ 完了 | 接続・Heartbeat・自動再接続対応 |
| イベントハンドラー実装 | ✅ 完了 | Webhookと同等の構造 |
| CLIコマンド追加 | ✅ 完了 | `npm run cli -- websocket` |
| Zoom Marketplace設定 | ⏳ ユーザー作業待ち | WebSocket購読を有効化が必要 |
| 実機テスト | ⏳ 未実施 | Marketplace設定後に実施予定 |

### 7.6 ユーザー作業（Zoom Marketplace設定）

1. Zoom Marketplaceでアプリ設定を開く
2. 「Features」→「WebSocket」セクションでWebSocket購読を有効化
3. 購読するイベントで `phone.callee_ringing` 等を選択
4. 設定を保存

### 7.7 参考資料

- [Zoom WebSocket API Documentation](https://developers.zoom.us/docs/api/websockets/)
- [WebSocket JS Sample (GitHub)](https://github.com/zoom/websocket-js-sample)
- [Zoom Phone WebSocket events format - Developer Forum](https://devforum.zoom.us/t/zoom-phone-websocket-events-format/92115)
- [ZoomPhone webhook call events not received - Developer Forum](https://devforum.zoom.us/t/zoomphone-webhook-call-events-not-received/127224)


## 8. 着信時発信者情報取得 - Webhook vs WebSocket 比較

着信時（`phone.callee_ringing`イベント）に発信者情報をリアルタイムで取得する方法を比較。

### 8.1 結論

**Webhookでも WebSocketでも同じ `phone.callee_ringing` イベントで発信者情報を取得可能。**

| ユースケース | 推奨方式 |
|------------|---------|
| クラウド環境（AWS/GCP/Azure）で公開URL提供可能 | **Webhook** |
| ローカル/社内環境で公開URL提供困難 | **WebSocket** |
| 既存のOAuthアプリを流用したい | **Webhook** |
| 新規にS2S OAuthアプリを作成可能 | **WebSocket** |

### 8.2 方式比較

| 項目 | Webhook (HTTP POST) | WebSocket |
|-----|---------------------|-----------|
| **配信方式** | Zoom → あなたのサーバー | あなた → Zoom (常時接続) |
| **公開URL** | **必須** (ngrok/ALB等) | **不要** |
| **認証** | OAuth (User-managed) | S2S OAuth **必須** |
| **セットアップ複雑さ** | 低 | 中（S2S OAuthアプリ作成） |
| **遅延** | 数百ms〜1秒程度 | 即時（常時接続） |
| **スケーラビリティ** | 高（Stateless） | 中（接続維持必要） |
| **実装ファイル** | `WebhookHandler.ts` | `WebSocketEventHandler.ts` |
| **CLIコマンド** | `npm run cli -- webhook` | `npm run cli -- websocket` |

### 8.3 取得できる発信者情報（両方式共通）

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

### 8.4 Webhookペイロード例

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

### 8.5 実装手順

#### Webhook方式

1. **Zoom Marketplaceでアプリを作成**: OAuth AppまたはWebhook Only Appを作成
2. **必要なスコープを設定**: `phone:read:admin`, `phone:write:admin`, `phone:read`, `phone:write`, `phone:master` のいずれか
3. **イベントをサブスクライブ**: アプリの設定で「Callee phone is ringing」イベントを有効化
4. **Webhook URLを設定**: 着信イベントを受信するエンドポイントを用意し、アプリに設定

```bash
# ngrokでWebhookエンドポイントを公開
ngrok http 3001

# Zoom MarketplaceでWebhook URLを設定
# https://xxxx.ngrok.io/webhook

# Webhookサーバー起動
npm run cli -- webhook
```

#### WebSocket方式

1. **S2S OAuthアプリを作成**: Zoom MarketplaceでServer-to-Server OAuthアプリを作成
2. **WebSocket購読を有効化**: FeaturesでWebSocket subscriptionを有効化
3. **イベントを選択**: `phone.callee_ringing` 等を購読

```bash
# WebSocketクライアント起動
npm run cli -- websocket
```

詳細は [S2S OAuthセットアップガイド](../setup/s2s-oauth-setup.md) を参照。

### 8.6 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/WebhookHandler.ts:238-262` | Webhook版着信処理 |
| `src/application/services/WebSocketEventHandler.ts:219-243` | WebSocket版着信処理 |
| `src/application/types/webhook.ts` | `CalleeRingingPayload` 型定義 |
| `src/presentation/cli/index.ts:335-346` | CLI着信表示 |


## まとめ表

| 要件 | 対応状況 | 備考 |
|------|---------|------|
| 電話履歴の取得 | ✅ 可能 | REST API で取得 |
| 音声データの取得 | ✅ 可能 | 録音ファイルのダウンロード（通話終了後） |
| リアルタイム音声ストリーミング | ❌ 不可 | Zoom Phone 非対応（RTMS は Meetings/Video SDK 専用） |
| リアルタイム文字起こし | ❌ 不可 | Live Transcription API は Phone 非対応 |
| Webhook での音声/文字起こし取得 | ❌ 不可 | イベント通知のみ、データは含まれない |
| Webhook でのリアルタイム着信通知 | ⚠️ 問題あり | Zoom側の配信問題の可能性、WebSocket代替実装済み |
| 履歴記録タイミングの検知 | ✅ 可能 | Webhookで通話終了・履歴作成を検知 |
| 通話中の履歴取得 | ❌ 不可 | 通話終了後にのみ作成・取得可能 |
| POC実装（ユーザーレベルAPI） | ✅ 完了 | 履歴・録音一覧・ダウンロード全て成功 |
| WebSocket API実装 | ✅ 完了 | 着信リアルタイム通知の代替手段 |
| 録音後の文字起こしダウンロード | ⚠️ 条件付き | 管理者設定が必要、API で取得可能 |
| 着信時発信者情報取得 | ✅ 可能 | Webhook/WebSocket両方式で `phone.callee_ringing` イベントで取得可能 |


## 参考資料

### Zoom公式ドキュメント

- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/) - 通話履歴APIの概要
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/) - 通話ログAPIの概要（非推奨情報含む）
- [Zoom Phone API Reference](https://developers.zoom.us/docs/api/rest/reference/phone/) - APIリファレンス
- [Zoom OAuth Scopes](https://developers.zoom.us/docs/integrations/oauth/) - OAuth認証とスコープ

### Zoom Developer Forum

- [Call Recordings with the Phone API](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848) - 録音API使用例
- [Accessing Zoom call stream in real-time](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153) - リアルタイムストリーミングの制約
- [Call History API Not Working](https://devforum.zoom.us/t/call-history-call-path-api-not-working-call-log-does-not-exist/108686) - 404エラー問題

### その他

- [7 APIs to get Zoom transcripts](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide) - 録音取得タイミングの解説


## 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-01-28 | 着信時発信者情報取得 Webhook vs WebSocket 比較セクション追加（callee-ringing-get-caller-info.md を統合） |
| 2026-01-27 | Webhookリアルタイムイベント配信問題調査、WebSocket API実装追加 |
| 2026-01-26 | POC実装検証結果追加、リアルタイム機能調査追加、参考資料セクション追加 |
| 2026-01-26 | 通話履歴作成タイミングの詳細調査結果追加 |
| 2026-01-25 | 初版作成 |