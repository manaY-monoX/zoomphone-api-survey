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


## まとめ表

| 要件 | 対応状況 | 備考 |
|------|---------|------|
| 電話履歴の取得 | ✅ 可能 | REST API で取得 |
| 音声データの取得 | ✅ 可能 | 録音ファイルのダウンロード（通話終了後） |
| リアルタイム音声ストリーミング | ❌ 不可 | Zoom Phone非対応（RTMS はMeetings/Video SDK専用） |
| 履歴記録タイミングの検知 | ✅ 可能 | Webhookで通話終了・履歴作成を検知 |
| POC実装（ユーザーレベルAPI） | ✅ 完了 | 履歴・録音一覧・ダウンロード全て成功 |

ご不明な点や追加の調査が必要な場合はお知らせください。