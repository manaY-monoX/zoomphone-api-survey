# Research & Design Decisions - Zoom Phone API POC

**作成日**: 2025-01-26
**バージョン**: 1.0

---

## Summary

- **Feature**: zoom-phone-api-poc
- **Discovery Scope**: New Feature / Complex Integration
- **Key Findings**:
  - 通話履歴の取得はCall History APIで可能（Call Logs APIは2025年6月サンセット予定）
  - 録音データは通話終了後に取得可能（通話中は取得不可）
  - リアルタイム音声ストリーミングの直接的なAPIは存在しない

---

## Research Log

### 1. 通話履歴取得APIの調査

- **Context**: Zoom Phoneの通話履歴を取得する最適なAPIを特定する必要があった
- **Sources Consulted**:
  - [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/)
  - [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/)
  - [Zoom Phone API Reference](https://developers.zoom.us/docs/api/rest/reference/phone/)
- **Findings**:
  - **Call History API（推奨）**:
    - `GET /phone/call_history` - アカウント全体の通話履歴
    - `GET /phone/call_history/{callLogId}` - 通話パスの詳細
    - `GET /phone/call_history_detail/{callLogId}` - Webhook専用の詳細情報
  - **Call Logs API（非推奨）**:
    - `GET /phone/call_logs` - 2025年6月18日にサンセット予定
    - `GET /phone/call_logs/{callLogId}` - 同上
    - `GET /phone/users/{userId}/call_logs` - ユーザー視点の通話ログ
  - Call Logs APIは最大6ヶ月のデータのみ返却
- **Implications**:
  - 新規実装ではCall History APIを使用する
  - Call Logs APIは使用しない（サンセット予定のため）

### 2. 録音データ取得APIの調査

- **Context**: 通話録音データの取得方法と制約を明確化する必要があった
- **Sources Consulted**:
  - [Call Recordings with the Phone API - Zoom Developer Forum](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848)
  - Zoom Phone API Reference
- **Findings**:
  - **API エンドポイント**:
    - `GET /phone/recordings` - ユーザーの録音一覧を取得
    - `GET /phone/recording/download/{download_url_key}` - 音声ファイルのダウンロード
  - **取得フロー**:
    1. `/phone/recordings` で録音一覧を取得
    2. レスポンスに含まれる `recording_id`, `download_url` を取得
    3. `download_url` から `download_url_key` を抽出
    4. `/phone/recording/download/{download_url_key}` で音声ファイルをダウンロード
  - **重要な制約**:
    - 録音は通話中には取得不可（処理が必要）
    - 処理時間: 通常は通話時間の2倍、最大24時間
- **Implications**:
  - 録音取得にはポーリングまたはWebhookを組み合わせる必要がある
  - リアルタイム要件がある場合は対応不可

### 3. リアルタイム音声ストリーミングの調査

- **Context**: リアルタイムで音声データを取得する方法があるか調査
- **Sources Consulted**:
  - [Accessing Zoom call stream in real-time - Zoom Developer Forum](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153)
  - Zoom Developer Documentation
- **Findings**:
  - **Zoom公式の回答**:
    - 直接的な音声ストリーミングAPIは提供されていない（2021年時点でロードマップにも存在しない）
    - Raw audio/videoが必要な場合は Fully Customizable SDK を使用することが推奨
  - **代替案Option A: RTMP Livestream API**:
    - Livestream APIを使用してRTMPサーバーに音声/映像をストリーミング
    - 要件: 事前設定、カスタムRTMPサーバー構築、音声抽出ロジック
    - メリット: Zoom APIの範囲内で実現可能
    - デメリット: 複雑な構成、遅延、Phone専用ではない
  - **代替案Option B: Fully Customizable SDK**:
    - Zoomとは独立した有料SDKで、raw audio/videoにアクセス可能
    - 要件: 別途契約・使用料、独立した実装
    - メリット: Raw audioデータに直接アクセス可能
    - デメリット: 有料、別製品、複雑な実装
- **Implications**:
  - POCの範囲ではリアルタイムストリーミングは対象外
  - 調査結果のみをドキュメント化

### 4. 録音が残るタイミングと取得可能性の調査

- **Context**: 録音データがいつ利用可能になるか明確化する必要があった
- **Sources Consulted**:
  - [7 APIs to get Zoom transcripts: A comprehensive guide](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide)
  - Zoom Developer Forum
- **Findings**:
  - **録音が残るタイミング**:
    - 通話終了後にCloud Recordingとして処理される
    - 処理時間: 通常は通話時間の2倍、最大24時間
  - **Webhookによる通知**:
    - `phone.callee_call_history_completed` - 着信側の通話完了
    - `phone.caller_call_history_completed` - 発信側の通話完了
  - **取得フロー**:
    1. Webhookで通話完了イベントをリアルタイムに受信
    2. Webhook経由で取得したIDを使用してCall History Detail APIで詳細情報を取得
    3. 録音が処理完了後、`/phone/recordings` APIで取得
- **Implications**:
  - Webhook + ポーリングの組み合わせが効果的
  - 録音処理完了までの待機ロジックが必要

### 5. OAuth認証スコープの調査

- **Context**: 必要なOAuthスコープを特定する必要があった
- **Sources Consulted**:
  - Zoom OAuth Scopes Documentation
  - Zoom Phone API Reference
- **Findings**:
  - **必須スコープ**:
    - `phone:read:list_call_logs:admin` - アカウントの通話履歴
    - `phone:read:call_log:admin` - 通話パス詳細
  - **オプションスコープ**:
    - `phone:read` - ユーザー視点の通話ログ
    - `phone:read:admin` - 管理者レベルのアクセス
  - 録音アクセスには追加スコープが必要（要確認）
- **Implications**:
  - 最小権限の原則に従い、必要なスコープのみを要求
  - スコープ不足時は403エラーが返る

---

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Layered Architecture | 層ごとに責任を分離 | シンプル、理解しやすい、POC向き | 大規模化すると層間の依存が複雑化 | **採用** |
| Hexagonal Architecture | ポート&アダプターパターン | 高いテスタビリティ、外部依存の交換容易 | 過剰設計、学習コスト | POCには過剰 |
| Clean Architecture | 依存関係の逆転 | 柔軟性、テスタビリティ | 複雑、POCには過剰 | 本番検討時に再評価 |

**採用理由**: Layered Architectureは、POCの目的である「技術検証」に最適。シンプルで理解しやすく、短期間で実装可能。本番環境への移行時に必要に応じて見直す。

---

## Design Decisions

### Decision: 通話履歴APIの選択

- **Context**: Call Logs API と Call History API の2つの選択肢があった
- **Alternatives Considered**:
  1. Call Logs API - 従来のAPI、ユーザー単位
  2. Call History API - 新API、アカウント単位
- **Selected Approach**: Call History API
- **Rationale**:
  - Call Logs APIは2025年6月18日にサンセット予定
  - Call History APIはアカウント全体の履歴を一度に取得可能
  - 新しいAPIのため、長期的なサポートが期待できる
- **Trade-offs**:
  - Call History APIはアカウント管理者権限が必要
  - 一部の詳細情報はCall History Detail APIで追加取得が必要
- **Follow-up**: 本番環境での権限設定を確認

### Decision: 技術スタックの選定

- **Context**: POCの実装言語とフレームワークを決定する必要があった
- **Alternatives Considered**:
  1. Node.js + TypeScript - 型安全、エコシステム充実
  2. Python + FastAPI - シンプル、データ処理向き
  3. Go - 高速、バイナリ配布容易
- **Selected Approach**: Node.js + TypeScript
- **Rationale**:
  - TypeScriptによる型安全性でAPI連携時のエラーを防止
  - npmエコシステムでHTTPクライアント、テストツールが充実
  - チームの習熟度が高い
- **Trade-offs**:
  - Node.jsのシングルスレッド特性（POCでは問題なし）
  - ビルド設定が必要
- **Follow-up**: tsconfig.json、ESLint設定を標準化

### Decision: HTTPクライアントの選定

- **Context**: Zoom APIとの通信に使用するHTTPクライアントを選定
- **Alternatives Considered**:
  1. axios - 広く使用、インターセプター機能
  2. node-fetch - ネイティブFetch API準拠
  3. got - 高機能、リトライ組み込み
- **Selected Approach**: axios
- **Rationale**:
  - リクエスト/レスポンスインターセプターでトークン管理が容易
  - エラーハンドリングが明確
  - チームの習熟度が高い
- **Trade-offs**:
  - バンドルサイズがやや大きい（POCでは問題なし）
- **Follow-up**: インターセプターでのトークン自動付与を実装

### Decision: Webhookサーバーの選定

- **Context**: Webhookイベント受信用のHTTPサーバーを選定
- **Alternatives Considered**:
  1. Express - 軽量、広く使用
  2. Fastify - 高速、スキーマ検証
  3. Hono - 軽量、Edge対応
- **Selected Approach**: Express
- **Rationale**:
  - シンプルで習得が容易
  - ミドルウェアエコシステムが充実
  - 署名検証の実装例が豊富
- **Trade-offs**:
  - 最速ではない（POCでは問題なし）
- **Follow-up**: body-parser、署名検証ミドルウェアを実装

### Decision: トークン永続化方式

- **Context**: OAuthトークンの保存方法を決定
- **Alternatives Considered**:
  1. 環境変数 + ファイル - シンプル
  2. Redis - 高速、TTL管理
  3. SQLite - 永続化、クエリ可能
- **Selected Approach**: 環境変数 + ファイル（.env.local）
- **Rationale**:
  - POCとして最もシンプル
  - 外部依存なし
  - デバッグが容易
- **Trade-offs**:
  - スケールしない（複数プロセス不可）
  - セキュリティ考慮が必要（.gitignore必須）
- **Follow-up**: 本番環境では暗号化ストレージまたはVaultを検討

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Call Logs APIサンセット | 高 | 確定 | Call History APIを使用（対応済み） |
| 録音処理遅延（最大24時間） | 中 | 中 | ポーリング + Webhook併用、ユーザー通知 |
| レート制限超過 | 中 | 低 | 指数バックオフリトライ、リクエスト頻度制御 |
| OAuth トークン漏洩 | 高 | 低 | 環境変数管理、.gitignore、マスク出力 |
| Webhook署名検証失敗 | 低 | 低 | 詳細ログ出力、テスト環境で事前検証 |
| ネットワーク不安定 | 低 | 中 | リトライロジック、タイムアウト設定 |

---

## References

### Zoom公式ドキュメント

- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/) - 通話履歴APIの概要
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/) - 通話ログAPIの概要（非推奨情報含む）
- [Zoom Phone API Reference](https://developers.zoom.us/docs/api/rest/reference/phone/) - APIリファレンス

### Zoom Developer Forum

- [Call Recordings with the Phone API](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848) - 録音API使用例
- [Accessing Zoom call stream in real-time](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153) - リアルタイムストリーミングの制約

### その他

- [7 APIs to get Zoom transcripts: A comprehensive guide](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide) - 録音取得タイミングの解説

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-26 | 初版作成 | - |
