# INDEX.mdドキュメント索引と運用ルール

## 運用原則
- `docs/` は知見とルールの唯一のソース・オブ・トゥルースです。
- `/docs/` 直下に置けるファイルは本索引 `docs/INDEX.md` のみ。他のドキュメントは必ずサブディレクトリに配置します。
- サブディレクトリは必要最小限に留め、命名は `kebab-case` に統一します。
- 追加・更新時は本索引を必ず更新し、重複やリンク切れ、プロジェクトの実情との生合成を定期的にチェックします。
- 機密情報（PII 等）は書き込み禁止。コミット時は `DOC:` プレフィックスを推奨します。

## ディレクトリ構成（最小セット）

```
docs/
├── INDEX.md          # 本索引ファイル
├── dev/              # 開発関連ドキュメント
│   └── branch.md     # ブランチ戦略とCI/CDワークフロー
├── setup/            # セットアップ・環境構築ガイド
│   └── zoom-account-setup.md  # Zoomアカウント環境設定ガイド（OAuth User-managed app）
├── specs/            # 仕様書・要件定義
│   └── require.md    # Zoom Phone API POC 要件定義書
└── survey/           # 調査ドキュメント
    ├── zoom-apis.md           # Zoom API調査結果（概要・インデックス）
    ├── call-history.md        # 電話履歴の取得
    ├── recording-download.md  # 録音ダウンロード
    ├── realtime-streaming.md  # リアルタイムストリーミング調査
    ├── call-log-timing.md     # 履歴作成タイミング
    ├── caller-info-on-ring.md # 着信時発信者情報取得
    └── zoom-api-design.md     # Zoom API設計判断・アーキテクチャ

.kiro/
└── specs/            # Kiro仕様ドキュメント
    └── zoom-phone-api-poc/
        ├── spec.json       # 仕様メタデータ
        ├── requirements.md # 要件定義書
        ├── design.md       # 技術設計書
        └── research.md     # 調査ログ
```

## ドキュメント一覧

### 開発関連（dev/）

- **[branch.md](./dev/branch.md)** - ブランチ運用戦略とGitHub ActionsによるCI/CDワークフローのテンプレート
  - ブランチ命名規則とライフサイクル
  - GitHub Actionsワークフローの設定例
  - コミットメッセージ規約
  - 運用フロー例とトラブルシューティング

### セットアップ・環境構築（setup/）

- **[zoom-account-setup.md](./setup/zoom-account-setup.md)** - Zoomアカウント環境設定ガイド（OAuth User-managed app）
  - Zoom Marketplaceでのアプリ作成手順
  - OAuth認証とスコープ設定
  - Webhook設定（オプション）
  - `.env`ファイルの設定方法
  - 動作確認とトラブルシューティング

### 仕様書・要件定義（specs/）

- **[require.md](./specs/require.md)** - Zoom Phone API POC 要件定義書
  - プロジェクト概要と検証対象機能
  - 技術仕様（使用API、認証要件、データフロー）
  - 実装要件（必須機能、調査対象機能、非機能要件）
  - 制約事項と既知の課題
  - 検証計画と成功基準
  - 参考資料一覧

### 調査ドキュメント（survey/）

- **[zoom-apis.md](./survey/zoom-apis.md)** - Zoom Phone API 技術調査結果（概要・インデックス）
  - 全調査項目のまとめと詳細ドキュメントへのリンク

#### 個別調査結果

| ドキュメント | 調査事項 | 結果 |
|-------------|---------|------|
| **[call-history.md](./survey/call-history.md)** | 電話履歴の取得 | ✅ 可能 |
| **[recording-download.md](./survey/recording-download.md)** | 履歴から音声データの取得 | ✅ 可能 |
| **[realtime-streaming.md](./survey/realtime-streaming.md)** | リアルタイム音声・文字起こし取得 | ❌ 不可 |
| **[call-log-timing.md](./survey/call-log-timing.md)** | 履歴が残るタイミング | ✅ 検知可能 |
| **[caller-info-on-ring.md](./survey/caller-info-on-ring.md)** | 着信時の電話番号取得 | ✅ 可能 |

- **[zoom-api-design.md](./survey/zoom-api-design.md)** - Zoom Phone API 設計判断・アーキテクチャ
  - アーキテクチャパターン評価（Layered Architecture採用理由）
  - 設計決定（API選択、技術スタック、HTTPクライアント等）
  - リスク分析と対策

### Kiro仕様ドキュメント（.kiro/specs/zoom-phone-api-poc/）

- **[spec.json](../.kiro/specs/zoom-phone-api-poc/spec.json)** - 仕様メタデータ
  - フェーズ管理（requirements, design, tasks）
  - 承認状況の追跡

- **[requirements.md](../.kiro/specs/zoom-phone-api-poc/requirements.md)** - 要件定義書
  - docs/specs/require.md のコピー

- **[design.md](../.kiro/specs/zoom-phone-api-poc/design.md)** - 技術設計書
  - アーキテクチャ設計（Layered Architecture）
  - システムフロー（OAuth認証、通話履歴取得、録音取得、Webhook処理）
  - コンポーネント設計とインターフェース定義
  - データモデル
  - エラーハンドリング戦略
  - テスト戦略

- **[research.md](../.kiro/specs/zoom-phone-api-poc/research.md)** - 調査ログ
  - API調査結果（通話履歴、録音、リアルタイムストリーミング）
  - アーキテクチャパターン評価
  - 設計決定の根拠
  - リスクと対策

## 更新手順（PDCA）
1. PLAN: 既存の配置と命名を本索引で確認し、追加箇所を決める。
2. DO: 対応するサブディレクトリに Markdown を作成・更新し、本索引へ追記。
3. CHECK: リンク・命名・重複・文責の整合を確認。
4. ACTION: 改善点を洗い出し、必要ならルールやテンプレートを強化する。

---

最終更新日: 2026-01-28