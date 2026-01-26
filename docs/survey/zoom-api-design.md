# Zoom Phone API 設計判断・アーキテクチャ

**作成日**: 2026-01-26
**更新日**: 2026-01-26

---

## 概要

本ドキュメントは、Zoom Phone API POCにおける設計判断、アーキテクチャ選定、リスク分析をまとめたものである。技術調査結果（`zoom-apis.md`）を基に、なぜその選択をしたかの根拠を記録する。

---

## アーキテクチャパターン評価

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Layered Architecture | 層ごとに責任を分離 | シンプル、理解しやすい、POC向き | 大規模化すると層間の依存が複雑化 | **採用** |
| Hexagonal Architecture | ポート&アダプターパターン | 高いテスタビリティ、外部依存の交換容易 | 過剰設計、学習コスト | POCには過剰 |
| Clean Architecture | 依存関係の逆転 | 柔軟性、テスタビリティ | 複雑、POCには過剰 | 本番検討時に再評価 |

**採用理由**: Layered Architectureは、POCの目的である「技術検証」に最適。シンプルで理解しやすく、短期間で実装可能。本番環境への移行時に必要に応じて見直す。

---

## 設計決定

### 1. 通話履歴APIの選択

| 項目 | 内容 |
|-----|------|
| Context | Call Logs API と Call History API の2つの選択肢があった |
| Alternatives | 1. Call Logs API - 従来のAPI、ユーザー単位<br>2. Call History API - 新API、アカウント単位 |
| Selected | **Call History API** |
| Rationale | ・Call Logs APIは2025年6月18日にサンセット予定<br>・Call History APIはアカウント全体の履歴を一度に取得可能<br>・新しいAPIのため、長期的なサポートが期待できる |
| Trade-offs | ・Call History APIはアカウント管理者権限が必要<br>・一部の詳細情報はCall History Detail APIで追加取得が必要 |
| Follow-up | 本番環境での権限設定を確認 |

### 2. 技術スタックの選定

| 項目 | 内容 |
|-----|------|
| Context | POCの実装言語とフレームワークを決定する必要があった |
| Alternatives | 1. Node.js + TypeScript - 型安全、エコシステム充実<br>2. Python + FastAPI - シンプル、データ処理向き<br>3. Go - 高速、バイナリ配布容易 |
| Selected | **Node.js + TypeScript** |
| Rationale | ・TypeScriptによる型安全性でAPI連携時のエラーを防止<br>・npmエコシステムでHTTPクライアント、テストツールが充実<br>・チームの習熟度が高い |
| Trade-offs | ・Node.jsのシングルスレッド特性（POCでは問題なし）<br>・ビルド設定が必要 |
| Follow-up | tsconfig.json、ESLint設定を標準化 |

### 3. HTTPクライアントの選定

| 項目 | 内容 |
|-----|------|
| Context | Zoom APIとの通信に使用するHTTPクライアントを選定 |
| Alternatives | 1. axios - 広く使用、インターセプター機能<br>2. node-fetch - ネイティブFetch API準拠<br>3. got - 高機能、リトライ組み込み |
| Selected | **axios** |
| Rationale | ・リクエスト/レスポンスインターセプターでトークン管理が容易<br>・エラーハンドリングが明確<br>・チームの習熟度が高い |
| Trade-offs | ・バンドルサイズがやや大きい（POCでは問題なし） |
| Follow-up | インターセプターでのトークン自動付与を実装 |

### 4. Webhookサーバーの選定

| 項目 | 内容 |
|-----|------|
| Context | Webhookイベント受信用のHTTPサーバーを選定 |
| Alternatives | 1. Express - 軽量、広く使用<br>2. Fastify - 高速、スキーマ検証<br>3. Hono - 軽量、Edge対応 |
| Selected | **Express** |
| Rationale | ・シンプルで習得が容易<br>・ミドルウェアエコシステムが充実<br>・署名検証の実装例が豊富 |
| Trade-offs | ・最速ではない（POCでは問題なし） |
| Follow-up | body-parser、署名検証ミドルウェアを実装 |

### 5. トークン永続化方式

| 項目 | 内容 |
|-----|------|
| Context | OAuthトークンの保存方法を決定 |
| Alternatives | 1. 環境変数 + ファイル - シンプル<br>2. Redis - 高速、TTL管理<br>3. SQLite - 永続化、クエリ可能 |
| Selected | **環境変数 + ファイル（.env.local）** |
| Rationale | ・POCとして最もシンプル<br>・外部依存なし<br>・デバッグが容易 |
| Trade-offs | ・スケールしない（複数プロセス不可）<br>・セキュリティ考慮が必要（.gitignore必須） |
| Follow-up | 本番環境では暗号化ストレージまたはVaultを検討 |

---

## リスク分析と対策

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Call Logs APIサンセット | 高 | 確定 | Call History APIを使用（対応済み） |
| 録音処理遅延（最大24時間） | 中 | 中 | ポーリング + Webhook併用、ユーザー通知 |
| レート制限超過 | 中 | 低 | 指数バックオフリトライ、リクエスト頻度制御 |
| OAuth トークン漏洩 | 高 | 低 | 環境変数管理、.gitignore、マスク出力 |
| Webhook署名検証失敗 | 低 | 低 | 詳細ログ出力、テスト環境で事前検証 |
| ネットワーク不安定 | 低 | 中 | リトライロジック、タイムアウト設定 |

---

## 参考資料

### Zoom公式ドキュメント

- [Understand Zoom Phone call history](https://developers.zoom.us/docs/phone/understanding-call-history/) - 通話履歴APIの概要
- [Understand Zoom Phone call logs](https://developers.zoom.us/docs/phone/understanding-call-logs/) - 通話ログAPIの概要（非推奨情報含む）
- [Zoom Phone API Reference](https://developers.zoom.us/docs/api/rest/reference/phone/) - APIリファレンス

### Zoom Developer Forum

- [Call Recordings with the Phone API](https://devforum.zoom.us/t/call-recordings-with-the-phone-api/96848) - 録音API使用例
- [Accessing Zoom call stream in real-time](https://devforum.zoom.us/t/accessing-zoom-call-stream-in-real-time/41153) - リアルタイムストリーミングの制約
- [Call History API Not Working](https://devforum.zoom.us/t/call-history-call-path-api-not-working-call-log-does-not-exist/108686) - 404エラー問題
- [Get Call Path API 404 Error](https://devforum.zoom.us/t/get-call-path-returning-code-404-call-log-does-not-exist/100578) - 404エラー問題

### その他

- [7 APIs to get Zoom transcripts: A comprehensive guide](https://www.recall.ai/blog/7-apis-to-get-zoom-transcripts-a-comprehensive-guide) - 録音取得タイミングの解説

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2026-01-26 | 初版作成（research.mdから設計判断を移行） | - |
