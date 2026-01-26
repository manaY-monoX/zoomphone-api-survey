# Zoom Phone API POC 要件定義書

**作成日**: 2025-01-23
**バージョン**: 1.0
**ステータス**: Draft

---

## 1. プロジェクト概要

### 1.1. 目的

Zoom Phone APIを使用した技術検証POC（Proof of Concept）を実施し、以下の機能の実現可能性を評価する：

- 通話履歴の取得
- 音声データ（録音）の取得
- リアルタイム音声ストリーミングの実現可能性
- 録音データの生成タイミングと取得可能性

### 1.2. 背景

Zoom Phone APIを活用したシステム構築を検討するにあたり、主要機能の技術的実現可能性、制約事項、代替案を明確にする必要がある。

### 1.3. スコープ

**対象範囲**:
- Zoom Phone APIの調査と検証
- 通話履歴および録音データの取得機能の実装
- リアルタイムストリーミングの代替案調査

**対象外**:
- 本番環境への展開
- ユーザーインターフェースの実装
- 大規模負荷テスト

---

## 2. 検証対象機能

### 2.1. 通話履歴の取得

#### 実現可能性
✅ **可能** - Zoom Phone API経由で取得可能

#### 使用API
- **推奨**: Call History API（新）
  - `GET /phone/call_history` - アカウント全体の通話履歴
  - `GET /phone/call_history/{callLogId}` - 通話パスの詳細
  - `GET /phone/call_history_detail/{callLogId}` - Webhook専用の詳細情報

- **非推奨**: Call Logs API（2025年6月18日サンセット予定）
  - `GET /phone/call_logs`
  - `GET /phone/call_logs/{callLogId}`
  - `GET /phone/users/{userId}/call_logs`

#### 認証要件
- OAuth スコープ:
  - `phone:read:list_call_logs:admin` - アカウントの通話履歴
  - `phone:read:call_log:admin` - 通話パス詳細
  - `phone:read` - ユーザー視点の通話ログ

#### 参考資料
- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/)
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/)

---

### 2.2. 音声データ（録音）の取得

#### 実現可能性
✅ **可能** - 通話終了後に取得可能

#### 使用API
- `GET /phone/recordings` - ユーザーの録音一覧を取得
- `GET /phone/recording/download/{download_url_key}` - 音声ファイルのダウンロード

#### 取得フロー
1. `/phone/recordings` で録音一覧を取得
2. レスポンスに含まれる `recording_id`, `download_url` を取得
3. `download_url` から `download_url_key` を抽出
4. `/phone/recording/download/{download_url_key}` で音声ファイルをダウンロード

#### 認証要件
- OAuth スコープ: 録音アクセスに必要な適切なスコープ

#### 重要な制約
- **録音は通話中には取得不可**（処理が必要）
- 録音処理時間: 通常は通話時間の2倍、最大24時間
  - 例: 30分の通話 → 約1時間後に利用可能

#### 参考資料
- [Call Recordings with the Phone API - Zoom Developer Forum](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848)

---

### 2.3. リアルタイム音声ストリーミングの調査

#### 実現可能性
❌ **直接的なAPIは存在しない**

#### Zoom公式の回答
- 直接的な音声ストリーミングAPIは提供されていない（2021年時点でロードマップにも存在しない）
- Raw audio/videoが必要な場合は Fully Customizable SDK を使用することが推奨

#### 代替案

##### Option A: RTMP Livestream API

**概要**:
- Livestream APIを使用してRTMPサーバーに音声/映像をストリーミング
- サーバー側で音声データを抽出

**要件**:
- 事前にミーティングでライブストリーミングを設定
- カスタムRTMPサーバーの構築
- サーバー側で音声データを抽出するロジックが必要

**メリット**:
- Zoom APIの範囲内で実現可能

**デメリット**:
- 複雑な構成が必要
- リアルタイム性に遅延が発生する可能性
- Phone専用ではなくMeeting用の機能

##### Option B: Fully Customizable SDK

**概要**:
- Zoomとは独立した有料SDKで、raw audio/videoにアクセス可能

**要件**:
- 別途契約・使用料が必要
- 独立した実装が必要

**メリット**:
- Raw audioデータに直接アクセス可能

**デメリット**:
- 有料
- Zoom Phone APIとは別の製品
- 実装の複雑さ

#### 参考資料
- [Accessing Zoom call stream in real-time - Zoom Developer Forum](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153)

---

### 2.4. 録音データの生成タイミングと取得可能性

#### 録音が残るタイミング
- 通話終了後にCloud Recordingとして処理される
- **処理時間**: 通常は通話時間の2倍、最大24時間
  - 例: 30分の通話 → 約1時間後に利用可能

#### Webhookによるリアルタイム通知
✅ **可能** - 通話完了イベントをリアルタイムに受信可能

**利用可能なWebhookイベント**:
- `phone.callee_call_history_completed` - 着信側の通話完了
- `phone.caller_call_history_completed` - 発信側の通話完了

**取得フロー**:
1. Webhookで通話完了イベントを受信
2. Webhook経由で取得したIDを使用してCall History Detail APIで詳細情報を取得
3. 録音が処理完了後、`/phone/recordings` APIで取得

#### 重要な制約
- 録音は通話中には取得不可（処理が必要）
- Webhookを使用しても、録音ファイルの取得は通話終了後の処理完了まで待つ必要がある

#### 参考資料
- [7 APIs to get Zoom transcripts: A comprehensive guide](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide)

---

## 3. 技術仕様

### 3.1. 使用API一覧

| API名 | エンドポイント | 用途 | ステータス |
|-------|---------------|------|-----------|
| Call History API | `GET /phone/call_history` | アカウント全体の通話履歴取得 | 推奨 |
| Call History Detail API | `GET /phone/call_history/{callLogId}` | 通話パスの詳細取得 | 推奨 |
| Call History Detail API (Webhook) | `GET /phone/call_history_detail/{callLogId}` | Webhook専用の詳細情報 | 推奨 |
| Phone Recordings API | `GET /phone/recordings` | 録音一覧の取得 | 推奨 |
| Recording Download API | `GET /phone/recording/download/{download_url_key}` | 音声ファイルのダウンロード | 推奨 |
| Call Logs API | `GET /phone/call_logs` | 通話ログ取得 | 非推奨（2025/6/18サンセット） |

### 3.2. 認証・認可

#### OAuth 2.0 スコープ

| スコープ | 説明 | 必須/オプション |
|---------|------|----------------|
| `phone:read:list_call_logs:admin` | アカウントの通話履歴 | 必須 |
| `phone:read:call_log:admin` | 通話パス詳細 | 必須 |
| `phone:read` | ユーザー視点の通話ログ | オプション |
| `phone:read:admin` | 管理者レベルのアクセス | オプション |

#### 認証フロー
1. OAuth 2.0認可コードフローでアクセストークンを取得
2. アクセストークンをBearerトークンとしてAPIリクエストに含める
3. トークンの有効期限管理とリフレッシュ処理を実装

### 3.3. データフロー

#### 通話履歴取得フロー

```
1. アプリケーション → Zoom API: GET /phone/call_history
2. Zoom API → アプリケーション: 通話履歴一覧（JSON）
3. アプリケーション → Zoom API: GET /phone/call_history/{callLogId}
4. Zoom API → アプリケーション: 通話詳細情報（JSON）
```

#### 録音データ取得フロー

```
1. Webhookサーバー ← Zoom: phone.caller_call_history_completed
2. アプリケーション → Zoom API: GET /phone/recordings
3. Zoom API → アプリケーション: 録音一覧（JSON、download_url含む）
4. アプリケーション: download_urlからdownload_url_keyを抽出
5. アプリケーション → Zoom API: GET /phone/recording/download/{download_url_key}
6. Zoom API → アプリケーション: 音声ファイル（バイナリ）
```

---

## 4. 実装要件

### 4.1. 必須機能

#### F-001: 通話履歴取得機能
- Call History APIを使用してアカウントの通話履歴を取得
- 通話IDを指定して詳細情報を取得
- データの永続化（ローカルストレージまたはデータベース）

#### F-002: 録音データ取得機能
- Phone Recordings APIを使用して録音一覧を取得
- download_url_keyの抽出ロジックを実装
- Recording Download APIを使用して音声ファイルをダウンロード
- ダウンロードした音声ファイルの保存

#### F-003: OAuth認証機能
- OAuth 2.0認可コードフローの実装
- アクセストークンの取得と管理
- トークンリフレッシュ機能

#### F-004: Webhook受信機能
- `phone.callee_call_history_completed` イベントの受信
- `phone.caller_call_history_completed` イベントの受信
- イベントデータの解析と処理

### 4.2. 調査対象機能

#### R-001: リアルタイムストリーミング代替案の調査
- RTMP Livestream APIの実現可能性評価
- Fully Customizable SDKのコスト・実装難易度評価
- その他の代替技術の調査

#### R-002: 録音処理時間の計測
- 通話終了から録音ファイル取得可能までの時間を計測
- 通話時間との相関関係を分析

### 4.3. 非機能要件

#### NFR-001: セキュリティ
- OAuth 2.0トークンの安全な保管（環境変数または暗号化ストレージ）
- APIリクエストのHTTPS通信
- 録音データの暗号化保存

#### NFR-002: エラーハンドリング
- APIレート制限エラーのハンドリングとリトライロジック
- ネットワークエラーのハンドリング
- 適切なログ出力とエラー通知

#### NFR-003: パフォーマンス
- 大量の通話履歴データの効率的な処理
- 録音ファイルのダウンロードタイムアウト設定

#### NFR-004: 可観測性
- APIリクエスト/レスポンスのログ出力
- 処理時間の計測
- エラーレートの監視

---

## 5. 制約事項

### 5.1. API制限

#### レート制限
- Zoom APIには厳格なレート制限が存在（詳細はZoom公式ドキュメント参照）
- 制限を超えた場合、`429 Too Many Requests` エラーが返却される

#### データ保持期間
- Call Logs APIは最大6ヶ月のデータのみ返却
- 録音データの保持期間はZoomアカウントの設定に依存

#### 非推奨API
- **Call Logs API** は 2025年6月18日にサンセット予定
- 新規実装では **Call History API** を使用すること

### 5.2. 技術的制約

#### 録音データの取得タイミング
- 録音は通話中には取得不可
- 通話終了後の処理完了まで待つ必要がある（通常は通話時間の2倍、最大24時間）

#### リアルタイムストリーミング
- Zoom Phone APIで直接的なリアルタイム音声ストリーミングは不可
- 代替案（RTMP、Fully Customizable SDK）は複雑性またはコストが高い

#### Webhook設定
- 通話完了イベントを受信するにはWebhookの事前設定が必要
- Webhookエンドポイントは公開インターネットからアクセス可能である必要がある

### 5.3. 既知の課題

#### Issue 1: 録音処理の遅延
- **問題**: 通話終了から録音ファイル取得可能まで最大24時間かかる場合がある
- **影響**: リアルタイム性を求めるユースケースには不適
- **対策**: Webhookを使用して通話完了を検知し、定期的にポーリングして録音の取得を試行

#### Issue 2: リアルタイムストリーミング非対応
- **問題**: Zoom Phone APIで直接的なリアルタイム音声ストリーミングは提供されていない
- **影響**: リアルタイム音声分析などのユースケースに制約
- **対策**: RTMP Livestream APIまたはFully Customizable SDKの採用を検討

#### Issue 3: API非推奨化
- **問題**: Call Logs APIが2025年6月18日にサンセット予定
- **影響**: 移行期間が限られている
- **対策**: 初めからCall History APIを使用して実装

---

## 6. 検証計画

### 6.1. 検証シナリオ

#### シナリオ1: 通話履歴の取得
1. Zoom Phoneで通話を実施
2. Call History APIで通話履歴を取得
3. 取得したデータの内容を検証（callLogId、通話時間、参加者情報など）
4. Call History Detail APIで詳細情報を取得
5. データの正確性を確認

#### シナリオ2: 録音データの取得
1. Zoom Phoneで録音を有効にして通話を実施
2. 通話終了後、Webhookで通話完了イベントを受信
3. Phone Recordings APIで録音一覧を取得
4. download_url_keyを抽出
5. Recording Download APIで音声ファイルをダウンロード
6. ダウンロードした音声ファイルの再生確認

#### シナリオ3: 録音処理時間の計測
1. 複数の通話を実施（通話時間を変えて実施）
2. 通話終了時刻を記録
3. 録音ファイルが取得可能になった時刻を記録
4. 処理時間を算出し、通話時間との相関を分析

#### シナリオ4: エラーハンドリング
1. 無効なcallLogIdでAPIリクエストを実行
2. レート制限を超えるリクエストを実行
3. ネットワークエラーをシミュレート
4. 各エラーケースで適切なエラーハンドリングが動作することを確認

### 6.2. 成功基準

#### SC-001: 通話履歴取得の成功
- Call History APIで通話履歴が正常に取得できる
- 取得したデータに必要な情報（callLogId、通話時間、参加者情報など）が含まれている
- Call History Detail APIで詳細情報が正常に取得できる

#### SC-002: 録音データ取得の成功
- Phone Recordings APIで録音一覧が正常に取得できる
- download_url_keyが正常に抽出できる
- Recording Download APIで音声ファイルが正常にダウンロードできる
- ダウンロードした音声ファイルが再生可能

#### SC-003: Webhook受信の成功
- 通話完了イベントがWebhookで正常に受信できる
- イベントデータが正常に解析できる
- イベント受信から録音取得までのフローが正常に動作する

#### SC-004: エラーハンドリングの成功
- 各種エラーケースで適切なエラーメッセージが出力される
- レート制限エラー時にリトライロジックが動作する
- ネットワークエラー時に適切に復旧できる

### 6.3. 想定される課題

#### 課題1: 録音処理の遅延
- **内容**: 通話終了から録音ファイル取得可能まで時間がかかる
- **対応**: 定期的なポーリング処理を実装し、録音の取得を試行

#### 課題2: Webhookエンドポイントの公開
- **内容**: Webhookエンドポイントは公開インターネットからアクセス可能である必要がある
- **対応**: ngrokなどのトンネリングツールを使用してローカル開発環境でもWebhookを受信できるようにする

#### 課題3: OAuth認証フローの複雑さ
- **内容**: OAuth 2.0認可コードフローの実装が複雑
- **対応**: Zoom SDKまたはOAuthライブラリを使用して実装を簡素化

#### 課題4: APIレート制限
- **内容**: 頻繁なAPIリクエストでレート制限に達する可能性
- **対応**: リクエストの頻度を制御し、キャッシュを活用

---

## 7. 参考資料

### Zoom公式ドキュメント

- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/)
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/)
- [Zoom Phone API Reference](https://developers.zoom.us/docs/api/rest/reference/phone/)

### Zoom Developer Forum

- [Call Recordings with the Phone API](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848)
- [Accessing Zoom call stream in real-time](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153)

### その他

- [7 APIs to get Zoom transcripts: A comprehensive guide](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide)

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-23 | 初版作成 | - |

---

## 承認

| 役割 | 氏名 | 承認日 | 署名 |
|-----|------|--------|------|
| プロジェクトマネージャー | - | - | - |
| 技術リード | - | - | - |
| ステークホルダー | - | - | - |
