# 履歴から音声データの取得

## 結論

✅ **可能** - 通話終了後に録音ファイルをダウンロードできる。

## 実現方法

Zoom Phone APIの録音エンドポイントを使用して、録音一覧の取得およびファイルのダウンロードを行う。

### 利用可能なエンドポイント

| エンドポイント | 用途 | 必要スコープ |
|---------------|------|-------------|
| `GET /phone/recordings` | 録音一覧（Admin） | `phone:read:admin` |
| `GET /phone/users/{userId}/recordings` | 特定ユーザーの録音（Admin） | `phone:read:admin` |
| `GET /phone/users/me/recordings` | 自分の録音一覧（User） | `phone:read:list_recordings` |
| `GET /phone/recording/download/{downloadKey}` | 録音ダウンロード | `phone:read:call_recording` |
| `GET /phone/recording_transcript/download/{recordingId}` | 文字起こしダウンロード | - |

### POCで使用したエンドポイント

User-levelエンドポイント `/phone/users/me/recordings` と `/phone/recording/download/{key}` を使用。

## 必要な条件

- **アカウントプラン**: Pro 以上
- **ライセンス**: Zoom Phone ライセンス
- **OAuthスコープ（User-level）**:
  - `phone:read:list_recordings` - 一覧取得
  - `phone:read:call_recording` - ダウンロード

### Zoom Phone 管理者設定

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

## 実装例

### 関連ファイル

| ファイル | 説明 |
|---------|------|
| `src/application/services/RecordingService.ts` | 録音取得・ダウンロードサービス |
| `src/infrastructure/storage/FileStorage.ts` | ファイル保存 |

### CLIコマンド

```bash
# 録音一覧を取得
npm run cli -- recordings

# 録音をダウンロード（録音IDを指定）
npm run cli -- download <recording-id>
```

### 検証結果（2026-01-26）

| 項目 | 結果 |
|-----|------|
| 手動録音（OnDemand） | ✅ 取得・ダウンロード成功 |
| ファイル形式 | audio/mpeg (MP3) |
| 録音品質 | 128 kbps, 16 kHz, Monaural |
| ファイルサイズ | 約226 KB (14秒の録音) |

## 注意点・制限事項

### リアルタイム取得は不可

録音は通話終了後のみ取得可能。通話中のストリーミング取得はできない。

詳細は [realtime-streaming.md](./realtime-streaming.md) を参照。

### AdminエンドポイントとUserエンドポイントの違い

| フィールド | Admin API | User API |
|-----------|-----------|----------|
| 終了時刻 | `end_date_time` | `end_time` |
| ファイルタイプ | `file_type` | 含まれない |
| ファイルサイズ | `file_size` | 含まれない |

### ダウンロードキーの抽出

`download_url` からダウンロードキーを抽出してAPIを呼び出す必要がある。

```typescript
// download_url例: https://zoom.us/phone/recording/download/xxx...
// 最後のパスセグメントがダウンロードキー
const downloadKey = new URL(downloadUrl).pathname.split('/').pop();
```

### 録音処理の遅延

- 通話終了後、録音ファイルが利用可能になるまで時間がかかる場合がある
- `phone.recording_completed` Webhookで録音完了を検知可能
- 推定遅延: 30秒〜数分（最長24時間の場合あり）

## 参考資料

- [Zoom Phone API Reference - Recordings](https://developers.zoom.us/docs/api/rest/reference/phone/methods/#tag/Recording)
- [Call Recordings with the Phone API - Developer Forum](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848)
