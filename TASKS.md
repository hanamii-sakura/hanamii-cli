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
- [ ] core/workspace, project-resolve, project-link
- [ ] core/deploy + poll + `deploy` コマンド（--no-wait / --timeout / --env / --git）
- [ ] projects list/get/create/delete, link/unlink

## Phase 3 運用コマンド

- [ ] env list/set, logs(+follow), restart, health-check, tokens
- [ ] db info/tables/rows

## Phase 4 MCP

- [ ] mcp/server + 読取系ツール（InMemoryTransport テスト）
- [ ] deploy_project / wait_deployment（progress 通知）、set_env、restart、delete(opt-in)
- [ ] resource / prompt、`mcp install`

## Phase 5 仕上げ

- [ ] 統合テスト（HANAMII_TOKEN ゲート）、README（JA/EN）
- [ ] release.yml で v0.1.0 公開、npx 検証
- [ ] hanamii-skills を `npx hanamii deploy` に切替、hanamii-frontend の llms.txt / ガイドの文言更新（別 PR）
- [ ] projects_index.md に hanamii-cli を追記
