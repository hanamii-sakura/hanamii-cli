# タスク

1 タスクずつ実装 → テスト → チェックの順で進める。

## Phase 0 足場

- [x] リポジトリ初期化（package.json / tsconfig / tsup / vitest / eslint / prettier / LICENSE / README / CI）、`hanamii --version` が動く、GitHub に hanamii-sakura/hanamii-cli を作成して push

## Phase 1 設定と API

- [x] config/paths + store + resolve（テスト: 優先順位、0600）
- [x] api/http（ストリーム JSON、body.error、429 backoff、timeout）+ errors
- [x] api/client 全エンドポイント + types（msw テスト）
- [x] login / logout / whoami / workspaces list

## Phase 2 デプロイ

- [x] zip/walk + build + precheck（fixtures）
- [x] api/upload-put（ローカル http サーバーで検証）
- [x] core/workspace, project-resolve, project-link
- [x] core/deploy + poll + `deploy` コマンド（--no-wait / --timeout / --env / --git）
- [x] projects list/get/create/delete, link/unlink

## Phase 3 運用コマンド

- [x] env list/set, logs(+follow), restart, health-check, tokens
- [x] db info/tables/rows

## Phase 4 MCP

- [x] mcp/server + 読取系ツール（InMemoryTransport テスト）
- [x] deploy_project / wait_deployment（progress 通知）、set_env、restart、delete(opt-in)
- [x] resource / prompt、`mcp install`

## Phase 5 仕上げ

- [x] `--help` のコマンド順を整理（login/logout/whoami → workspaces → deploy/link/unlink → projects → env/logs/restart/health-check → tokens → db → mcp）、engines を `>=20.3`（AbortSignal.any 使用のため）
- [x] 統合テスト（HANAMII_TOKEN があるときだけ実行、`npm run test:integration`）
- [x] README（日本語 README.md と英語 README.en.md）
- [x] v0.1.0 を npm に公開（2FA 有効化後にローカルから publish）、`npx -y hanamii@latest --version` と MCP 起動を検証。release.yml は公開済みバージョンをスキップ
- [x] hanamii-skills を `npx hanamii deploy` に切替（hanamii-skills#1）、hanamii-frontend の llms.txt / ガイドの文言更新（PR 作成済み、マージ待ち）
- [x] projects_index.md に hanamii-cli を追記（状態も更新済み）
