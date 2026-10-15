# Changelog

## Unreleased

- MCP サーバーの統合テストを追加（stdio で起動し、deploy_project から delete_project までを実 API で確認。`npm run test:integration`）

## 0.1.0 - 2026-10-14

初回リリース。npm パッケージ `hanamii` に CLI と stdio MCP サーバーを同梱。

- 認証: `login`（PAT 貼り付け、`GET /user/tokens/current` で検証）/ `logout` / `whoami`。優先順位は `--token` > `HANAMII_TOKEN` > 設定ファイル。`HANAMII_BASE_URL` で接続先を上書き
- デプロイ: `deploy`（ZIP 作成 → アップロード → 検証 → 作成または再デプロイ → READY まで待機）、`.hanamii/project.json` によるプロジェクトリンク、`link` / `unlink`
- 運用: `projects list/get/create/delete`、`env list/set`、`logs`（`--follow` 対応）、`restart`、`health-check get/set`、`tokens list/create/revoke`、`db info/tables/rows`（読取のみ）
- MCP: `hanamii mcp` で読取 8 ツールと deploy / wait / set_env / restart / set_health_check、`--allow-delete` で delete_project、リソース `hanamii://docs/public-api`、プロンプト `deploy_app`、`mcp install --client claude-code|cursor|codex|claude-desktop`
- bash スクリプト互換の終了コード（0/1/2/3/5/6/8/10/11）、`--json` 出力、トークンの伏字化
- 統合テスト `npm run test:integration`（`HANAMII_TOKEN` があるときだけ実行）
