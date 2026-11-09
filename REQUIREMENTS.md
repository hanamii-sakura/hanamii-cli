# 要件: hanamii CLI + MCP サーバー

## 目的

hanamii（公開 REST API v1、Bearer トークン `hnm_…`）を、ブラウザのダッシュボードを開かずに
ターミナルと AI コーディングエージェントから使えるようにする。

- npm パッケージ名: `hanamii`（CLI `hanamii` と MCP サーバー `hanamii mcp` を同梱）
- 既存 API の範囲だけで作る。hanamii-frontend 側の変更はしない（ビルドログ取得などは後続）
- Node.js 20 以上、ESM、TypeScript

## 確定事項

- MCP はローカル stdio のみ（リモート MCP / OAuth は次フェーズ）
- ログインは PAT 貼り付け（ブラウザでトークン発行ページを開く → 貼り付け → `GET /user/tokens/current` で検証 → 保存）
- トークンの優先順位: `--token` > 環境変数 `HANAMII_TOKEN` > 設定ファイル
- 設定ファイル: `$XDG_CONFIG_HOME/hanamii/config.json`（既定 `~/.config/hanamii/`、Windows は `%APPDATA%`）、mode 0600
- `HANAMII_BASE_URL` で接続先を上書きできる（既定 `https://hanamii.jp`）
- トークンをログ・エラー出力・`--json` に含めない

## API の前提（hanamii-frontend で確認済み）

- `POST /uploads/:id/check`、`POST /projects`、`POST /projects/:id/deploy`、`POST /projects/:id/restart` は
  keep-alive ストリーム応答になりうる。先頭に空白、5 秒ごとに空白、最後に JSON。
  ストリーム化すると HTTP ステータスは常に 200 で、失敗時は本文が `{error:{code,message}}`。
  クライアントは本文を全部読み、先頭の `{` から parse し、`error` キーがあればステータスに関わらずエラー扱いにする
- エラーコード: unauthorized / forbidden / validation_error / not_found / conflict / payload_too_large /
  unsupported_media_type / rate_limited（`X-RateLimit-Reset` は epoch 秒）/ service_unavailable / internal_error
- 一覧はカーソルページング（`limit` 既定 20 最大 100、`until` / `since`、応答 `pagination`）。時刻は epoch ms
- デプロイ: workspaces → uploads → 署名 URL へ PUT（15 分有効、Authorization なし）→ check → create | deploy →
  `GET /projects/:id` を `latestDeployment.readyState` が READY | ERROR になるまでポーリング（最大 15 分）。`checkId` は使い捨て
- env は PATCH の upsert のみ（削除 API なし）。logs にストリーミングはない
- ZIP: symlink 不可。言語判定は composer.json > package.json(`scripts.start` 必須) > requirements.txt | pyproject.toml
- DB（beta）: 読取のみ（`GET /database`、`/database/tables`、`/database/tables/:table/rows`）

## CLI コマンド

全コマンド共通: `--json` / `--token` / `--workspace`。

login, logout, whoami, workspaces list, projects list|get|create|delete, deploy, link, unlink,
env list|set, logs, restart, health-check get|set, tokens list|create|revoke, db info|tables|rows,
mcp, mcp install

終了コード: 0 成功 / 1 一般 / 2 使い方 / 3 認証 / 5 ローカル事前検証失敗 / 6 workspace 曖昧 /
8 check エラー / 10 デプロイ ERROR / 11 タイムアウト

## MCP ツール

list_workspaces, list_projects, get_project, deploy_project, wait_deployment, get_logs, get_env, set_env,
restart_project, get_health_check, set_health_check, db_list_tables, db_query_rows,
delete_project（`--allow-delete` 時のみ）。
リソース `hanamii://docs/public-api`、プロンプト `deploy_app`。stdout はプロトコル専用、ログは stderr。

## 追加要件（2026-11-09）: ダッシュボードの全機能を CLI / MCP から操作できるようにする

柴田指示「全部できるようにしたい」。対象は 2026-11-09 の調査で挙げた不足分すべて。段階を分けて進める。

### 段階 A: 公開 API にある機能を載せる（hanamii-frontend は変更しない）

- オブジェクトストレージ（`/workspaces/:workspaceId/storage/**`）: バケット一覧・作成・削除、アクセスキー一覧・発行・無効化、
  ファイル一覧、閲覧 URL 発行、利用量
- DB 管理（`/projects/:id/database/**`）: 作成・削除、情報、接続トークン一覧・発行・失効、エクスポート、インポート
- GitHub ソース: MCP からリポジトリ指定の新規作成、既存 Git ソースの再デプロイ
- API トークン: MCP から一覧・発行・失効
- ストレージのファイル操作（アップロード・削除）: アクセスキーで接続先のファイル API を直接呼ぶ（公開 API とは別系統。要設計）

### 段階 B: 公開 API の追加が先に必要（hanamii-frontend 側の作業。develop への PR → main へ cherry-pick）

スケジューラー、独自ドメイン、セキュリティチェック、バージョン切り替え、停止プロジェクトの復帰、アクセス制限、
ビルドログ、環境変数の削除、GitHub 連携のリポジトリ・ブランチ一覧、メンバー招待・管理。
課金（プラン変更・支払い方法）と DB の行の書き込み・SQL 実行は範囲と設計を柴田さんに確認してから着手する。

### 段階 C: リモート MCP / OAuth

ローカル stdio 以外（claude.ai のコネクタなど）から使えるようにする。段階 B の後に設計する。

### ストレージ API の前提（hanamii-frontend main で確認済み）

- 応答は envelope なし。一覧は `{items, nextCursor}`（バケット一覧は `apiOrigin` も返す）。ページ送りは `cursor` クエリ
- `DELETE` は本文なしの 204。バケット削除は処理が続くとき 202 `{status: "processing"}`
- バケット名は英小文字・数字・ハイフンで 3〜63 文字。`visibility` は `public` / `private`（作成後は変更不可、無料プランは `private` のみ）
- アクセスキーの `permission` は `read_only` / `read_write`。完全な鍵 `key` は発行時の応答にだけ含まれる
- 一覧・閲覧 URL・利用量はメンバー全員、バケット作成・削除とキー操作は owner / admin
- 容量・件数は 10 進の文字列（`sizeBytes`、`usedBytes` など）
- 非公開バケットの閲覧 URL は 1 時間有効（`expiresAt`）、公開バケットは固定 URL（`expiresAt: null`）

### MCP での安全策

- データが消える操作（プロジェクト削除、バケット削除、DB 削除）は `--allow-delete` で起動したときだけ登録し、名前の再入力で確認する
- 鍵・トークンの平文を返すツールは、発行時の 1 回だけ返す。ログには出さない

## 参照

- 計画の全文: `~/.claude/plans/mcp-cli-toasty-dijkstra.md`
- 置き換え対象の bash 実装: `hanamii-skills/skills/hanamii-deploy/scripts/hanamii-deploy.sh`
- API 設計書: `hanamii-frontend/docs/public-api/公開API仕様.md`
