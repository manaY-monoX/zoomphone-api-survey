# Zoom Phone API 技術調査結果
調査対象: 
- developers.zoom.us
- marketplace.zoom.us

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


## まとめ表

| 要件 | 対応状況 | 備考 |
|------|---------|------|
| 電話履歴の取得 | ✅ 可能 | REST API で取得 |
| 音声データの取得 | ✅ 可能 | 録音ファイルのダウンロード（通話終了後） |
| リアルタイム音声ストリーミング | ❌ 不可 | Zoom Phone非対応（RTMS はMeetings/Video SDK専用） |
| 履歴記録タイミングの検知 | ✅ 可能 | Webhookで通話終了・履歴作成を検知 |

ご不明な点や追加の調査が必要な場合はお知らせください。