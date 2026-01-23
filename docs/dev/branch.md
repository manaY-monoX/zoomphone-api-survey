# Branch Strategy & CI/CD Workflow

ブランチ運用戦略とGitHub Actionsによる自動化ワークフロー（Pull Request の自動作成を除く）のテンプレートです。プロジェクトに適用する際は、実際のプロジェクト構成に合わせてカスタマイズしてください。

## ブランチ戦略

### 基本方針

- **main ブランチへの直接 push は禁止**
- すべての作業は専用のフィーチャーブランチで実施
- PR マージ後に main ブランチを更新

### ブランチ命名規則

#### Feature ブランチ

```
feature/<feature-name>
```

**例:**
- `feature/user-authentication` - ユーザー認証機能追加
- `feature/api-integration` - API統合機能追加
- `feature/ui-improvements` - UI改善

**命名ルール:**
- すべて小文字
- 複数単語はハイフン区切り（kebab-case）
- 簡潔で目的が明確な名前
- 英語推奨（日本語ローマ字可）

#### その他のブランチ（必要に応じて）

```
bugfix/<bug-description>    # バグ修正
hotfix/<urgent-fix>          # 緊急修正
docs/<doc-update>            # ドキュメント更新のみ
refactor/<refactor-target>   # リファクタリング
```

### ブランチのライフサイクル

1. **作成**: main から最新の状態で派生
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature
   ```

2. **作業**: コミットを積み重ねる
   ```bash
   git add .
   git commit -m "PREFIX: Commit message"
   git push origin feature/your-feature
   ```

3. **PR 作成**: GitHub 上で手動で PR を作成

4. **レビュー & マージ**: PR を確認後、main へマージ

5. **削除**: マージ後は不要なブランチを削除
   ```bash
   git branch -d feature/your-feature
   git push origin --delete feature/your-feature
   ```

## GitHub Actions ワークフロー

### Feature Branch CI/CD

GitHub Actionsを使用した自動化ワークフローのテンプレートです。プロジェクトの構成に合わせてカスタマイズしてください。

**ファイル:** `.github/workflows/feature-ci.yml`（プロジェクトに応じて作成）

**トリガー条件例:**
```yaml
on:
  push:
    branches:
      - 'feature/**'
```

**ワークフロー概要:**

#### Quality Check Job

feature ブランチへの push 時に自動実行される品質チェック：

プロジェクトの構成に応じて、以下のようなチェックを実装します：

- **Lint チェック**
  - コード品質の検証
  - プロジェクトで使用しているLinterに応じて設定

- **フォーマットチェック**
  - コードフォーマット規約準拠確認
  - インデント、改行、引用符などの統一性検証

- **ビルドチェック**
  - ビルド成功確認
  - ビルドサイズ計測（必要に応じて）

**実装例（Node.jsプロジェクトの場合）:**
```yaml
- name: Run lint check
  run: npm run lint:check

- name: Run format check
  run: npm run format:check

- name: Run build
  run: npm run build
```

### 必要な Repository 設定

品質チェック用の GitHub Actions を動作させるために、必要に応じて Repository Permissions を設定してください。

### ワークフロー実行環境

プロジェクトの構成に応じて、適切な実行環境を設定してください：

- **OS:** ubuntu-latest（推奨）
- **ランタイム:** プロジェクトに応じて設定（Node.js、Python、Goなど）
- **パッケージマネージャー:** プロジェクトに応じて設定（npm、yarn、pipなど）
- **キャッシュ戦略:** 使用するパッケージマネージャーに応じて設定

## Commit Message 規約

### 基本フォーマット

```
<PREFIX>: <commit message>
```

**重要:** PREFIX の後には必ずコロンとスペースを入れる

### PREFIX 一覧

| PREFIX | 用途 | 例 |
|--------|------|-----|
| `FEATURE` | 新機能追加 | `FEATURE: ユーザー認証機能を追加` |
| `FIX` | バグ修正 | `FIX: 画像の読み込みエラーを修正` |
| `REFACTOR` | リファクタリング | `REFACTOR: コンポーネントの最適化` |
| `STYLE` | スタイル変更（CSS/UI） | `STYLE: モバイル表示のメニュー位置を調整` |
| `DOC` | ドキュメント更新 | `DOC: README にセットアップ手順を追記` |
| `TEST` | テスト追加・修正 | `TEST: ユニットテストを追加` |
| `CHORE` | ビルド・設定変更 | `CHORE: ビルド設定を更新` |
| `PERF` | パフォーマンス改善 | `PERF: 画像の遅延読み込みを実装` |
| `CI` | CI/CD 設定変更 | `CI: GitHub Actions のワークフローを追加` |

### 英語コミットメッセージ（推奨）

プロジェクトの国際性を考慮し、英語でのコミットメッセージも推奨：

```
FEATURE: Add user authentication
FIX: Resolve image loading error
STYLE: Adjust mobile menu positioning
DOC: Update README with setup instructions
```

### コミットメッセージのベストプラクティス

1. **簡潔で明確に**: 50文字以内が理想
2. **動詞から始める**: 「追加」「修正」「更新」など
3. **現在形を使用**: 「追加した」ではなく「追加」
4. **具体的に**: 「バグ修正」ではなく「ロゴ読み込みエラーを修正」
5. **1コミット1機能**: 複数の変更は分割する

**良い例:**
```
FEATURE: ユーザー認証機能を追加
DOC: README にセットアップ手順を追記
STYLE: デスクトップナビゲーションのレイアウトを調整
```

**悪い例:**
```
update  # PREFIX なし、内容不明
FIX:バグ修正  # スペースなし、具体性なし
いろいろ変更  # PREFIX なし、曖昧
```

### マルチライン コミットメッセージ

複雑な変更の場合、本文を追加可能：

```bash
git commit -m "FEATURE: 新機能を追加" -m "
- ユーザー認証機能の実装
- API統合の追加
- UIコンポーネントの更新
"
```

## 運用フロー例

### 典型的な開発フロー

1. **新機能開発の開始**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/new-animation
   ```

2. **実装とコミット**
   ```bash
   # ファイル編集...
   git add .
   git commit -m "FEATURE: 新機能を追加"
   git push origin feature/new-feature
   ```

3. **GitHub Actions 自動実行**（設定済みの場合）
   - 品質チェック実行（Lint、Format、Buildなど）

4. **PR レビュー & マージ**
   - GitHub UI で PR を確認
   - 必要に応じてコードレビュー
   - Merge pull request ボタンをクリック

5. **ローカル更新**
   ```bash
   git checkout main
   git pull origin main
   git branch -d feature/new-feature
   ```

### 緊急修正（Hotfix）フロー

本番環境の緊急バグ修正時：

1. **Hotfix ブランチ作成**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug
   ```

2. **修正とテスト**
   ```bash
   # バグ修正...
   git add .
   git commit -m "FIX: 本番環境でのクリティカルなバグを緊急修正"
   git push origin hotfix/critical-bug
   ```

3. **手動 PR 作成（緊急時）**
   ```bash
   gh pr create --base main --head hotfix/critical-bug \
     --title "🚨 [HOTFIX] Critical bug fix" \
     --body "緊急修正: 本番環境でのクリティカルなバグ"
   ```

4. **即座にマージ & デプロイ**

## トラブルシューティング

GitHub Actions による品質チェックが失敗する場合は、各プロジェクトの構成に応じてローカルで同等のコマンドを実行し、エラーを解消してから再度 push してください。

### ブランチ名の競合

**エラー例:**
```
'refs/heads/feature' exists; cannot create 'refs/heads/feature/add-gtm'
```

**原因:** Git のブランチ名前空間の競合（`feature` と `feature/xxx` は共存不可）

**解決策:**
```bash
# リモートの競合ブランチを削除
git push origin --delete feature

# または、ローカルブランチ名を変更
git branch -m feature/add-gtm feature-add-gtm
git push origin feature-add-gtm
```

## 関連ドキュメント

- [docs/INDEX.md](../INDEX.md) - ドキュメント索引
- [AGENTS.md](../../AGENTS.md) - エージェント運用ルール

## 更新履歴

- 2025-12-05: 初版作成（テンプレートプロジェクト用に汎用化）