# Zoom Phone API POC 実装タスク

**作成日**: 2025-01-26
**バージョン**: 1.0
**ステータス**: Draft

---

## タスク概要

本ドキュメントは、Zoom Phone API POCの実装に必要なタスクを定義する。各タスクは要件定義書および技術設計書に基づいて作成されている。

### 要件-タスクトレーサビリティ

| 要件ID | 要件名 | 対応タスク |
|--------|--------|-----------|
| F-001 | 通話履歴取得機能 | Task 4 |
| F-002 | 録音データ取得機能 | Task 5 |
| F-003 | OAuth認証機能 | Task 3 |
| F-004 | Webhook受信機能 | Task 6 |
| NFR-001 | セキュリティ | Task 2.2, 6.2 |
| NFR-002 | エラーハンドリング | Task 2.1 |
| NFR-003 | パフォーマンス | Task 2.1 |
| NFR-004 | 可観測性 | Task 2.4 |

### タスク依存関係

```
Task 1 (セットアップ)
    ↓
Task 2 (Infrastructure Layer) ← 並列実行可能: 2.1, 2.2, 2.3, 2.4
    ↓
Task 3 (OAuth認証)
    ↓
┌───────┼───────┐
↓       ↓       ↓
Task 4  Task 5  Task 6  ← 並列実行可能
│       │       │
└───────┼───────┘
        ↓
Task 7 (統合・検証)
        ↓
Task 8 (テスト) ← 並列実行可能: 8.1, 8.2, 8.3, 8.4
```

---

## Task 1: プロジェクト初期セットアップ

**ステータス**: [x] 完了

### Task 1.1: Node.js + TypeScript環境構築

- [x] **完了**

**説明**: Node.js 20 LTS環境でTypeScriptプロジェクトを初期化する。

**成果物**:
- `package.json` - プロジェクト定義
- `tsconfig.json` - TypeScript設定（strict mode有効化）
- `src/` - ソースディレクトリ構造

**実装詳細**:
```bash
# プロジェクト初期化
npm init -y

# TypeScript設定
npm install typescript @types/node --save-dev
npx tsc --init
```

**tsconfig.json設定**:
- `target`: ES2022
- `module`: NodeNext
- `moduleResolution`: NodeNext
- `strict`: true
- `outDir`: ./dist
- `rootDir`: ./src

**受け入れ条件**:
- [ ] `npm run build` でコンパイルが成功する
- [ ] `src/index.ts` が作成されている

---

### Task 1.2: 依存パッケージのインストール

- [x] **完了**

**説明**: 設計書で定義された依存パッケージをインストールする。

**必須パッケージ**:
```json
{
  "dependencies": {
    "axios": "^1.x",
    "express": "^4.x",
    "dotenv": "^16.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/express": "^4.x",
    "ts-node": "^10.x",
    "nodemon": "^3.x",
    "jest": "^29.x",
    "@types/jest": "^29.x",
    "ts-jest": "^29.x"
  }
}
```

**受け入れ条件**:
- [ ] すべての依存パッケージがインストールされている
- [ ] `npm install` が警告なく完了する

---

### Task 1.3: 環境変数設定

- [x] **完了**

**説明**: 環境変数の設定ファイルとテンプレートを作成する。

**成果物**:
- `.env.example` - 環境変数テンプレート
- `.env` - ローカル環境変数（.gitignore対象）
- `.gitignore` - Git除外設定

**環境変数一覧**:
```env
# Zoom OAuth設定
ZOOM_CLIENT_ID=your_client_id
ZOOM_CLIENT_SECRET=your_client_secret
ZOOM_REDIRECT_URI=http://localhost:3000/oauth/callback

# Zoom API設定
ZOOM_API_BASE_URL=https://api.zoom.us/v2

# Webhook設定
WEBHOOK_PORT=3001
ZOOM_WEBHOOK_SECRET_TOKEN=your_webhook_secret

# ログ設定
LOG_LEVEL=debug

# ファイル保存設定
RECORDINGS_OUTPUT_DIR=./recordings
```

**受け入れ条件**:
- [ ] `.env.example` が作成されている
- [ ] `.env` が `.gitignore` に追加されている
- [ ] `dotenv` で環境変数が読み込める

---

### Task 1.4: ディレクトリ構造作成

- [x] **完了**

**説明**: 設計書に基づいたディレクトリ構造を作成する。

**ディレクトリ構造**:
```
src/
├── application/           # Application Layer
│   ├── services/
│   │   ├── OAuthService.ts
│   │   ├── CallHistoryService.ts
│   │   ├── RecordingService.ts
│   │   └── WebhookHandler.ts
│   └── types/
│       ├── auth.ts
│       ├── callHistory.ts
│       ├── recording.ts
│       └── webhook.ts
├── infrastructure/        # Infrastructure Layer
│   ├── http/
│   │   └── HttpClient.ts
│   ├── storage/
│   │   ├── TokenStore.ts
│   │   └── FileStorage.ts
│   ├── server/
│   │   └── WebhookServer.ts
│   └── logging/
│       └── Logger.ts
├── presentation/          # Presentation Layer
│   └── cli/
│       └── index.ts
├── config/
│   └── index.ts
└── index.ts
```

**受け入れ条件**:
- [ ] 上記ディレクトリ構造が作成されている
- [ ] 各ディレクトリに `index.ts` または該当ファイルが存在する

---

## Task 2: Infrastructure Layer 実装

**ステータス**: [x] 完了
**依存**: Task 1

> **Note**: Task 2.1〜2.4は相互依存がないため並列実行可能

### Task 2.1: HttpClient実装

- [x] **完了**

**説明**: axiosをラップしたHTTPクライアントを実装する。リトライロジック、エラーハンドリング、インターセプターを含む。

**要件対応**: NFR-002（エラーハンドリング）、NFR-003（パフォーマンス）

**成果物**: `src/infrastructure/http/HttpClient.ts`

**インターフェース**:
```typescript
interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  retryConfig: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatuses: number[];
  };
}

interface HttpClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<Result<T, ApiError>>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<Result<T, ApiError>>;
  setAuthToken(token: string): void;
}
```

**実装詳細**:
- 指数バックオフによるリトライ（最大3回）
- レート制限エラー（429）の自動リトライ
- Retry-Afterヘッダーの尊重
- リクエスト/レスポンスのログ出力

**受け入れ条件**:
- [ ] GET/POSTリクエストが実行できる
- [ ] 429エラー時に自動リトライする
- [ ] 500系エラー時に指数バックオフでリトライする
- [ ] タイムアウト設定が機能する

---

### Task 2.2: TokenStore実装

- [x] **完了**

**説明**: OAuthトークンの永続化を担当するストアを実装する。

**要件対応**: NFR-001（セキュリティ）

**成果物**: `src/infrastructure/storage/TokenStore.ts`

**インターフェース**:
```typescript
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

interface TokenStore {
  save(data: TokenData): Promise<void>;
  load(): Promise<TokenData | null>;
  clear(): Promise<void>;
  isExpired(): boolean;
  getTimeUntilExpiry(): number;
}
```

**実装詳細**:
- JSONファイルベースの永続化（`.tokens.json`）
- ファイルは`.gitignore`に追加
- 有効期限の15分前をリフレッシュ閾値とする

**受け入れ条件**:
- [ ] トークンの保存・読み込みができる
- [ ] 有効期限のチェックができる
- [ ] ファイルが存在しない場合にnullを返す

---

### Task 2.3: FileStorage実装

- [x] **完了**

**説明**: 録音ファイルの保存を担当するストレージを実装する。

**成果物**: `src/infrastructure/storage/FileStorage.ts`

**インターフェース**:
```typescript
interface FileStorage {
  save(fileName: string, data: Buffer): Promise<string>; // 保存パスを返す
  exists(fileName: string): Promise<boolean>;
  getPath(fileName: string): string;
  ensureDirectory(): Promise<void>;
}
```

**実装詳細**:
- 環境変数`RECORDINGS_OUTPUT_DIR`で保存先を指定
- ディレクトリが存在しない場合は自動作成
- ファイル名の重複時はタイムスタンプを付与

**受け入れ条件**:
- [ ] バイナリデータをファイルとして保存できる
- [ ] 保存先ディレクトリを自動作成できる
- [ ] 保存したファイルのパスを返す

---

### Task 2.4: Logger実装

- [x] **完了**

**説明**: 可観測性を確保するためのロガーを実装する。

**要件対応**: NFR-004（可観測性）

**成果物**: `src/infrastructure/logging/Logger.ts`

**インターフェース**:
```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}
```

**実装詳細**:
- 環境変数`LOG_LEVEL`でログレベルを制御
- JSON形式でログ出力（構造化ログ）
- タイムスタンプ、ログレベル、メッセージ、コンテキストを含む
- トークンなどの機密情報はマスク処理

**受け入れ条件**:
- [ ] 各ログレベルで出力できる
- [ ] 環境変数でログレベルを制御できる
- [ ] 機密情報がマスクされる

---

## Task 3: OAuth認証機能実装

**ステータス**: [x] 完了
**依存**: Task 2
**要件対応**: F-003

### Task 3.1: 認可URL生成機能

- [x] **完了**

**説明**: OAuth 2.0認可コードフローの認可URLを生成する機能を実装する。

**成果物**: `src/application/services/OAuthService.ts` （部分）

**インターフェース**:
```typescript
getAuthorizationUrl(state: string): string;
```

**実装詳細**:
- 認可エンドポイント: `https://zoom.us/oauth/authorize`
- 必要なスコープ: `phone:read:list_call_logs:admin phone:read:call_log:admin`
- state パラメータでCSRF対策

**受け入れ条件**:
- [ ] 有効な認可URLが生成される
- [ ] スコープが正しく含まれる
- [ ] stateパラメータが含まれる

---

### Task 3.2: 認可コード→トークン交換機能

- [x] **完了**

**説明**: 認可コードをアクセストークンとリフレッシュトークンに交換する機能を実装する。

**成果物**: `src/application/services/OAuthService.ts` （部分）

**インターフェース**:
```typescript
exchangeCodeForToken(code: string): Promise<Result<TokenPair, AuthError>>;
```

**実装詳細**:
- トークンエンドポイント: `https://zoom.us/oauth/token`
- Basic認証でClient ID/Secretを送信
- 取得したトークンはTokenStoreに保存

**受け入れ条件**:
- [ ] 有効な認可コードでトークンが取得できる
- [ ] 無効なコードでエラーが返される
- [ ] 取得したトークンがTokenStoreに保存される

---

### Task 3.3: トークンリフレッシュ機能

- [x] **完了**

**説明**: リフレッシュトークンを使用してアクセストークンを更新する機能を実装する。

**成果物**: `src/application/services/OAuthService.ts` （部分）

**インターフェース**:
```typescript
refreshToken(): Promise<Result<TokenPair, AuthError>>;
```

**実装詳細**:
- リフレッシュトークンでトークンエンドポイントにリクエスト
- 新しいトークンペアをTokenStoreに保存
- リフレッシュ失敗時は再認証が必要

**受け入れ条件**:
- [ ] 有効なリフレッシュトークンで新しいトークンが取得できる
- [ ] 無効なリフレッシュトークンでエラーが返される
- [ ] 新しいトークンがTokenStoreに保存される

---

### Task 3.4: 認証状態管理機能

- [x] **完了**

**説明**: 認証状態の管理と有効なアクセストークンの取得を行う機能を実装する。

**成果物**: `src/application/services/OAuthService.ts` （完成）

**インターフェース**:
```typescript
getAccessToken(): Promise<Result<string, AuthError>>;
isAuthenticated(): boolean;
logout(): void;
```

**実装詳細**:
- `getAccessToken`: 有効期限切れ前に自動リフレッシュ
- `isAuthenticated`: トークンの存在と有効期限をチェック
- `logout`: TokenStoreからトークンを削除

**受け入れ条件**:
- [ ] 有効なトークンがある場合はそのまま返す
- [ ] 有効期限切れ15分前に自動リフレッシュする
- [ ] 認証状態を正しく判定できる
- [ ] ログアウトでトークンが削除される

---

## Task 4: 通話履歴取得機能実装

**ステータス**: [x] 完了
**依存**: Task 3
**要件対応**: F-001

### Task 4.1: 通話履歴一覧取得機能

- [x] **完了**

**説明**: Call History APIを使用してアカウント全体の通話履歴を取得する機能を実装する。

**成果物**: `src/application/services/CallHistoryService.ts` （部分）

**インターフェース**:
```typescript
getCallHistory(params: CallHistoryParams): Promise<Result<CallHistoryResponse, ApiError>>;
```

**API仕様**:
- エンドポイント: `GET /phone/call_history`
- パラメータ: `from`, `to`, `page_size`, `next_page_token`
- レスポンス: 通話ログの配列とページネーション情報

**受け入れ条件**:
- [ ] 通話履歴一覧が取得できる
- [ ] 日付範囲でフィルタリングできる
- [ ] APIエラーが適切にハンドリングされる

---

### Task 4.2: 通話詳細取得機能

- [x] **完了**

**説明**: 通話IDを指定して詳細情報を取得する機能を実装する。

**成果物**: `src/application/services/CallHistoryService.ts` （部分）

**インターフェース**:
```typescript
getCallHistoryDetail(callLogId: string): Promise<Result<CallHistoryDetail, ApiError>>;
```

**API仕様**:
- エンドポイント: `GET /phone/call_history/{callLogId}`
- レスポンス: 通話パス、録音情報を含む詳細データ

**受け入れ条件**:
- [ ] 通話IDで詳細情報が取得できる
- [ ] 存在しないIDで404エラーが返される
- [ ] 通話パス情報が含まれる

---

### Task 4.3: ページネーション処理

- [x] **完了**

**説明**: 全ページの通話履歴を自動的に取得するAsyncGeneratorを実装する。

**成果物**: `src/application/services/CallHistoryService.ts` （完成）

**インターフェース**:
```typescript
getAllCallHistory(params: CallHistoryParams): AsyncGenerator<CallLog, void, unknown>;
```

**実装詳細**:
- `next_page_token`を使用して次ページを取得
- AsyncGeneratorでストリーミング的にデータを返す
- レート制限を考慮した待機処理

**受け入れ条件**:
- [ ] 複数ページにわたる通話履歴を全件取得できる
- [ ] for-await-ofで反復処理できる
- [ ] ページ間で適切な待機が行われる

---

## Task 5: 録音データ取得機能実装

**ステータス**: [x] 完了
**依存**: Task 3
**要件対応**: F-002

### Task 5.1: 録音一覧取得機能

- [x] **完了**

**説明**: Phone Recordings APIを使用して録音一覧を取得する機能を実装する。

**成果物**: `src/application/services/RecordingService.ts` （部分）

**インターフェース**:
```typescript
getRecordings(userId: string): Promise<Result<RecordingListResponse, ApiError>>;
```

**API仕様**:
- エンドポイント: `GET /phone/recordings`
- パラメータ: `user_id`, `page_size`, `next_page_token`
- レスポンス: 録音の配列とdownload_urlを含む

**受け入れ条件**:
- [ ] 録音一覧が取得できる
- [ ] 各録音にdownload_urlが含まれる
- [ ] APIエラーが適切にハンドリングされる

---

### Task 5.2: download_url_key抽出機能

- [x] **完了**

**説明**: download_urlからdownload_url_keyを抽出する機能を実装する。

**成果物**: `src/application/services/RecordingService.ts` （部分）

**インターフェース**:
```typescript
extractDownloadKey(downloadUrl: string): string;
```

**実装詳細**:
- download_urlのパスから最後のセグメントを抽出
- URLエンコードされている場合はデコード

**受け入れ条件**:
- [ ] 有効なdownload_urlからキーが抽出できる
- [ ] 無効なURLでエラーが発生する

---

### Task 5.3: 録音ファイルダウンロード機能

- [x] **完了**

**説明**: Recording Download APIを使用して音声ファイルをダウンロードする機能を実装する。

**成果物**: `src/application/services/RecordingService.ts` （完成）

**インターフェース**:
```typescript
downloadRecording(downloadUrl: string, outputPath: string): Promise<Result<DownloadResult, ApiError>>;
```

**API仕様**:
- エンドポイント: `GET /phone/recording/download/{download_url_key}`
- レスポンス: 音声ファイル（バイナリ）

**実装詳細**:
- ストリーミングでダウンロード
- FileStorageを使用してファイル保存
- 進捗ログの出力

**受け入れ条件**:
- [ ] 音声ファイルがダウンロードできる
- [ ] 指定したパスにファイルが保存される
- [ ] ダウンロード結果（パス、サイズ、MIMEタイプ）が返される

---

## Task 6: Webhook受信機能実装

**ステータス**: [x] 完了
**依存**: Task 3
**要件対応**: F-004

### Task 6.1: WebhookServer（Express）セットアップ

- [x] **完了**

**説明**: Webhookを受信するExpressサーバーをセットアップする。

**成果物**: `src/infrastructure/server/WebhookServer.ts`

**インターフェース**:
```typescript
interface WebhookServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(handler: (event: ZoomWebhookEvent) => Promise<void>): void;
}
```

**実装詳細**:
- Expressでシンプルなサーバーを構築
- `/webhook` エンドポイントを公開
- JSON bodyのパース設定

**受け入れ条件**:
- [ ] サーバーが指定ポートで起動する
- [ ] `/webhook` にPOSTリクエストを受信できる
- [ ] サーバーが正常に停止できる

---

### Task 6.2: 署名検証ミドルウェア

- [x] **完了**

**説明**: Zoomからのリクエストを署名で検証するミドルウェアを実装する。

**要件対応**: NFR-001（セキュリティ）

**成果物**: `src/infrastructure/server/WebhookServer.ts` （ミドルウェア追加）

**実装詳細**:
- `x-zm-signature` ヘッダーを検証
- HMAC-SHA256で署名を計算
- タイムスタンプの検証（リプレイ攻撃防止）

**受け入れ条件**:
- [ ] 有効な署名のリクエストが通過する
- [ ] 無効な署名で401エラーが返される
- [ ] 古いタイムスタンプで拒否される

---

### Task 6.3: WebhookHandler実装

- [x] **完了**

**説明**: Webhookイベントを処理するハンドラーを実装する。

**成果物**: `src/application/services/WebhookHandler.ts`

**インターフェース**:
```typescript
interface WebhookHandler {
  handleEvent(event: ZoomWebhookEvent): Promise<void>;
  onCallCompleted(callback: (payload: CallHistoryCompletedPayload) => Promise<void>): void;
}
```

**対応イベント**:
- `phone.callee_call_history_completed`
- `phone.caller_call_history_completed`

**受け入れ条件**:
- [ ] 通話完了イベントを処理できる
- [ ] コールバックが正しく呼び出される
- [ ] 未対応イベントは無視される

---

### Task 6.4: イベントキュー処理

- [x] **完了**

**説明**: 受信したイベントをキューに格納し非同期で処理する機能を実装する。

**成果物**: `src/application/services/WebhookHandler.ts` （キュー処理追加）

**実装詳細**:
- インメモリキュー（POC用途のため簡易実装）
- 冪等性チェック（call_log_idで重複排除）
- 即座に200 OKを返却し、処理は非同期で実行

**受け入れ条件**:
- [ ] イベントがキューに追加される
- [ ] 重複イベントが排除される
- [ ] キューからイベントが順次処理される

---

## Task 7: 統合・検証

**ステータス**: [x] 完了
**依存**: Task 4, 5, 6

### Task 7.1: CLIスクリプト作成

- [x] **完了**

**説明**: 各機能を手動で実行・検証するためのCLIスクリプトを作成する。

**成果物**: `src/presentation/cli/index.ts`

**コマンド一覧**:
```
npm run cli -- auth          # OAuth認証フローを開始
npm run cli -- history       # 通話履歴を取得
npm run cli -- recordings    # 録音一覧を取得
npm run cli -- download <id> # 録音をダウンロード
npm run cli -- webhook       # Webhookサーバーを起動
```

**受け入れ条件**:
- [ ] 各コマンドが実行できる
- [ ] ヘルプが表示される
- [ ] エラー時に適切なメッセージが出力される

---

### Task 7.2: 統合テスト

- [x] **完了**

**説明**: 各サービスを組み合わせた統合テストを実装する。

**成果物**: `tests/integration/`

**テストケース**:
- OAuth認証 → 通話履歴取得 → 詳細表示
- Webhook受信 → 録音取得 → ファイル保存
- トークン有効期限切れ → 自動リフレッシュ → API呼び出し成功

**受け入れ条件**:
- [ ] 統合テストが実行できる
- [ ] モックサーバーを使用してオフラインでテスト可能

---

### Task 7.3: E2Eテスト

- [x] **完了**

**説明**: 実際のZoom APIを使用したE2Eテストを実装する。

**成果物**: `tests/e2e/`

**前提条件**:
- Zoom開発者アカウントとアプリケーション設定
- テスト用の通話履歴・録音データ

**テストシナリオ**:
- シナリオ1: OAuth認証 → 通話履歴取得 → 詳細表示
- シナリオ2: Webhook受信 → 録音取得 → ファイル保存
- シナリオ3: トークン有効期限切れ → 自動リフレッシュ → API呼び出し成功

**受け入れ条件**:
- [ ] E2Eテストが実行できる
- [ ] 実際のZoom APIとの通信が成功する

---

## Task 8: テスト実装

**ステータス**: [x] 完了
**依存**: Task 7

> **Note**: Task 8.1〜8.4は独立しているため並列実行可能

### Task 8.1: OAuthService単体テスト

- [x] **完了**

**説明**: OAuthServiceの単体テストを実装する。

**成果物**: `tests/unit/services/OAuthService.test.ts`

**テストケース**:
- 認可URL生成のテスト
- トークン交換のテスト（成功/失敗）
- トークンリフレッシュのテスト（成功/失敗）
- 自動リフレッシュのテスト
- 認証状態チェックのテスト

**受け入れ条件**:
- [ ] 全テストケースが実装されている
- [ ] カバレッジ80%以上

---

### Task 8.2: CallHistoryService単体テスト

- [x] **完了**

**説明**: CallHistoryServiceの単体テストを実装する。

**成果物**: `tests/unit/services/CallHistoryService.test.ts`

**テストケース**:
- 通話履歴一覧取得のテスト
- 通話詳細取得のテスト
- ページネーション処理のテスト
- エラーハンドリングのテスト

**受け入れ条件**:
- [ ] 全テストケースが実装されている
- [ ] カバレッジ80%以上

---

### Task 8.3: RecordingService単体テスト

- [x] **完了**

**説明**: RecordingServiceの単体テストを実装する。

**成果物**: `tests/unit/services/RecordingService.test.ts`

**テストケース**:
- 録音一覧取得のテスト
- download_url_key抽出のテスト
- 録音ダウンロードのテスト
- エラーハンドリングのテスト

**受け入れ条件**:
- [ ] 全テストケースが実装されている
- [ ] カバレッジ80%以上

---

### Task 8.4: WebhookHandler単体テスト

- [x] **完了**

**説明**: WebhookHandlerの単体テストを実装する。

**成果物**: `tests/unit/services/WebhookHandler.test.ts`

**テストケース**:
- 署名検証のテスト
- イベントタイプ判定のテスト
- コールバック呼び出しのテスト
- 冪等性チェックのテスト
- キュー処理のテスト

**受け入れ条件**:
- [ ] 全テストケースが実装されている
- [ ] カバレッジ80%以上

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|---------|--------|
| 1.0 | 2025-01-26 | 初版作成 | - |
