# Zoom アカウント環境設定ガイド

## 概要

Zoom Phone API POCを実際のZoomアカウントで動作させるための`.env`設定手順を説明します。

---

## Step 1: Zoom Marketplace でアプリを作成

### 1.1 Zoom App Marketplace にアクセス

1. https://marketplace.zoom.us/ にアクセス
2. 右上の「Develop」→「Build App」をクリック
3. Zoomアカウントでサインイン（管理者権限が必要）

### 1.2 アプリタイプの選択

1. 「OAuth」を選択（User-managed app）
2. 「Create」をクリック
3. アプリ名を入力（例：`Zoom Phone API POC`）

### 1.3 アプリ設定

**App Credentials タブ:**
- `Client ID` をコピー → `.env` の `ZOOM_CLIENT_ID` に設定
- `Client Secret` をコピー → `.env` の `ZOOM_CLIENT_SECRET` に設定

**Redirect URL for OAuth:**
- `http://localhost:3000/oauth/callback` を追加
- 本番環境では適切なURLに変更

---

## Step 2: スコープの設定

### 2.1 必要なスコープ

「Scopes」タブで以下を追加:

| スコープ | 説明 |
|---------|------|
| `phone:read:list_call_logs` | Zoom Phone ユーザーのコールログ一覧を確認 |
| `phone:read:call_log` | 個別のコールログを確認 |
| `phone:read:list_recordings` | Zoom Phone ユーザーのレコーディング一覧を確認 |
| `phone:read:call_recording` | 個別のコールレコーディングを確認 |

**追加手順:**
1. 「+ Add Scopes」をクリック
2. 「Phone」カテゴリを選択
3. 上記スコープにチェック
4. 「Done」をクリック

### 2.2 スコープのレベルについて

> **注意:** 上記はユーザーレベルのスコープです。認証したユーザー自身のデータのみアクセス可能です。
>
> 組織全体のコールログやレコーディングにアクセスする場合は `:admin` サフィックス付きのスコープ（例: `phone:read:list_call_logs:admin`）が必要ですが、Zoomアカウント管理者による追加権限の付与が必要です。
>
> 「For additional scopes, contact your account admin.」というメッセージが表示された場合は、Zoom管理者に連絡してください。

---

## Step 3: Webhook設定（オプション）

### 3.1 Event Subscriptions

1. 「Feature/Access」タブ → 「Event Subscriptions」を有効化
2. 「+ Add Event Subscription」をクリック
3. Subscription name: `Call History Events`
4. Event notification endpoint URL:
   - 開発時: `https://<your-ngrok-url>/webhook`
   - ngrokを使用: `ngrok http 3001` でURLを取得

### 3.2 イベントタイプの選択

以下を選択:
- `Callee call history is completed`
- `Caller call histroy is completed`

### 3.3 Verification Token

- 「Secret Token」をコピー → `.env` の `ZOOM_WEBHOOK_SECRET_TOKEN` に設定

---

## Step 4: .env ファイルの作成

```bash
# プロジェクトディレクトリで実行
cp .env.example .env
```

`.env` を編集:

```env
# Zoom OAuth設定（Step 1で取得）
ZOOM_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxx
ZOOM_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ZOOM_REDIRECT_URI=http://localhost:3000/oauth/callback

# Zoom API設定（変更不要）
ZOOM_API_BASE_URL=https://api.zoom.us/v2

# Webhook設定（Step 3で取得）
WEBHOOK_PORT=3001
ZOOM_WEBHOOK_SECRET_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx

# ログ設定
LOG_LEVEL=debug

# ファイル保存設定
RECORDINGS_OUTPUT_DIR=./recordings
```

---

## Step 5: 動作確認

### 5.1 OAuth認証テスト

```bash
npm run cli -- auth
```

表示されたURLをブラウザで開き、Zoomアカウントで認証。

### 5.2 通話履歴取得テスト

```bash
npm run cli -- history
```

### 5.3 Webhookテスト（ngrok使用）

```bash
# ターミナル1: ngrok起動
ngrok http 3001

# ターミナル2: Webhookサーバー起動
npm run cli -- webhook
```

---

## トラブルシューティング

| エラー | 原因 | 対処 |
|-------|------|------|
| `Invalid client_id` | Client IDが間違っている | Marketplaceで再確認 |
| `Redirect URI mismatch` | リダイレクトURIが一致しない | Marketplaceの設定を確認 |
| `Insufficient scopes` | スコープ不足 | 必要なスコープを追加 |
| `401 Unauthorized` | トークン期限切れ | 再認証を実行 |
| `Invalid access token, does not contain scopes:[...:admin]` | Admin用エンドポイントにユーザースコープでアクセス | 本アプリはユーザーレベルエンドポイントを使用するため、このエラーは発生しません。発生した場合はコードの更新を確認 |
| `Invalid scope` | Marketplaceでスコープが設定されていない | Step 2のスコープ設定を確認 |

---

## 検証チェックリスト

このガイドに従って設定を完了し、以下を確認してください:

- [ ] `npm run cli -- auth` で認証URLが生成される
- [ ] ブラウザで認証後、`.tokens.json` が作成される
- [ ] `npm run cli -- history` で通話履歴が取得できる
- [ ] （オプション）Webhookでリアルタイムイベントが受信できる

---

## 関連ドキュメント

- [要件定義書](../specs/require.md)
- [Zoom API調査結果](../survey/zoom-apis.md)
- [技術設計書](../../.kiro/specs/zoom-phone-api-poc/design.md)

---

最終更新日: 2025-01-26
