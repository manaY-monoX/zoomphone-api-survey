# ストリーミングでのリアルタイム音声と文字起こしの取得

## 結論

❌ **不可** - Zoom Phoneでは通話中のリアルタイム音声ストリーミングおよびリアルタイム文字起こしAPIは提供されていない。

## 調査結果

### リアルタイム音声ストリーミング

Zoom Phone では通話中の音声をリアルタイムに取得する公式な方法は存在しない。

| 方法 | 対応状況 | 備考 |
|-----|---------|------|
| RTMS (Realtime Media Streams) | ❌ 非対応 | Meetings/Video SDK 専用 |
| RTMP ストリーミング | ❌ 非対応 | Meetings/Webinar 専用 |
| Video SDK | ❌ 非対応 | Phone との統合なし |
| SIP トランキング | ❌ 不可 | 音声キャプチャ機能なし |
| サードパーティ (Recall.ai等) | ❌ 非対応 | Meeting Bot 方式、Phone 非対応 |

### リアルタイム文字起こし

- Live Transcription API は Zoom Phone 非対応
- Zoom Phone UI では Live Transcription 機能があるが、API として公開されていない
- Zoom Contact Center でも同様の制限あり

### RTMS (Realtime Media Streams) について

Zoomには RTMS という機能が存在するが、対象は以下のみ:

- Zoom Meetings
- Zoom Video SDK

Zoom Phone での利用は不可。

## 実現可能な代替案

### 準リアルタイム方式（録音後処理）

真の「リアルタイム」は実現不可。通話終了後に録音をダウンロードし、外部STTサービスで文字起こしを行う方式のみ可能。

```
通話終了 → phone.recording_completed Webhook発火
         → 録音ダウンロード
         → 外部STTサービスで文字起こし
```

#### 使用可能な外部STTサービス

- OpenAI Whisper
- Google Speech-to-Text
- AWS Transcribe
- Azure Speech Services

#### 推定遅延

| ケース | 遅延時間 |
|-------|---------|
| 最短 | 30秒〜数分 |
| 最長 | 最大24時間（Zoom側の処理状況による） |

### Webhookでのイベント通知

音声データは取得できないが、通話イベントのリアルタイム通知は可能。

| イベント | 説明 |
|---------|------|
| `phone.callee_ringing` | 着信開始通知 |
| `phone.callee_answered` | 通話開始通知 |
| `phone.callee_ended` | 通話終了通知 |
| `phone.recording_completed` | 録音完了通知 |
| `phone.recording_transcript_completed` | 文字起こし完了通知 |

**制限**: Webhookはイベント通知のみで、音声データ・文字起こしテキストは含まれない。実際のデータ取得には REST API 呼び出しが必要。

## 必要な条件

この機能は実現不可のため、条件は該当なし。

## 実装例

該当なし（機能が存在しないため）。

## 注意点・制限事項

- Zoom Phone のリアルタイムストリーミング機能は将来のロードマップにも明示されていない
- Zoom Meetings との統合（ミーティングへの電話参加）でも RTMS 経由での音声取得は不可
- SIP トランキングを使用しても、Zoom側での音声キャプチャ機能は提供されていない

## 参考資料

- [Accessing Zoom call stream in real-time - Developer Forum](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153)
- [Zoom RTMS Documentation](https://developers.zoom.us/docs/video-sdk/rtms/) - Meetings/Video SDK専用
- [7 APIs to get Zoom transcripts](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide)
