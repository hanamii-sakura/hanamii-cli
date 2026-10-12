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

## 参照

- 計画の全文: `~/.claude/plans/mcp-cli-toasty-dijkstra.md`
- 置き換え対象の bash 実装: `hanamii-skills/skills/hanamii-deploy/scripts/hanamii-deploy.sh`
- API 設計書: `hanamii-frontend/docs/public-api/公開API仕様.md`
