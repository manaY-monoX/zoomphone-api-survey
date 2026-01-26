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


## まとめ表

| 要件 | 対応状況 | 備考 |
|------|---------|------|
| 電話履歴の取得 | ✅ 可能 | REST API で取得 |
| 音声データの取得 | ✅ 可能 | 録音ファイルのダウンロード（通話終了後） |
| リアルタイム音声ストリーミング | ❌ 不可 | Zoom Phone 非対応（RTMS は Meetings/Video SDK 専用） |
| リアルタイム文字起こし | ❌ 不可 | Live Transcription API は Phone 非対応 |
| Webhook での音声/文字起こし取得 | ❌ 不可 | イベント通知のみ、データは含まれない |
| 履歴記録タイミングの検知 | ✅ 可能 | Webhookで通話終了・履歴作成を検知 |
| POC実装（ユーザーレベルAPI） | ✅ 完了 | 履歴・録音一覧・ダウンロード全て成功 |
| 録音後の文字起こしダウンロード | ⚠️ 条件付き | 管理者設定が必要、API で取得可能 |