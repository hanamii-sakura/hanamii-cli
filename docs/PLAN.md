# hanamii CLI + MCP サーバー 実装計画

## Context

hanamii は公開 REST API v1（Bearer PAT `hnm_…`）と Agent Skill（`hanamii-sakura/hanamii-skills` の bash スクリプト）でエージェントからのデプロイに対応しているが、`public/llms.txt` や各ガイドに「専用 CLI と MCP サーバーはありません（2026年10月時点）」と明記されている。Backlog HANAMIIDEV-106 でも「API/CLI だけで開発を完結させたい」が挙がっている。

今回つくるもの: npm パッケージ `hanamii`（名前は未取得を確認済み。npm 未ログインなので公開時に `npm login` が必要）。1 パッケージで

- CLI `hanamii`（login / deploy / logs / env …）
- ローカル stdio MCP サーバー `hanamii mcp`（Claude Code / Cursor / Codex から利用）

を提供する。既存 API の範囲内で作り、hanamii-frontend 側の変更は行わない（ビルドログ API 等は後続）。

**ユーザー決定事項**

- 置き場所: 新リポジトリ `~/Documents/code/hanamii/hanamii-cli`（GitHub `hanamii-sakura/hanamii-cli`、public、MIT）
- MCP: ローカル stdio のみ（リモート MCP は次フェーズ）
- ログイン: PAT 貼り付け（ブラウザでトークン発行ページを開く → 貼り付け → 検証 → 保存）
- スコープ: 既存 v1 API のみ

**進め方**: グローバル CLAUDE.md のルールに従い、`TASKS.md` を置いて 1 タスクずつ実装 → テスト → チェックの順で進める。

## 調査で確定した API の事実（クライアント設計の前提）

参照: `hanamii-frontend/src/server/public-api/http/publicApi.ts`、`docs/public-api/公開API仕様.md`、`hanamii-skills/skills/hanamii-deploy/scripts/hanamii-deploy.sh`

- **keep-alive ストリーム**: `POST /uploads/:id/check`（常に）、`POST /projects`、`POST /projects/:id/deploy`、`POST /projects/:id/restart`（1 秒以上かかった時）は先頭に空白を流し、5 秒ごとに空白を送り、最後に JSON を書く。**ストリーム化すると HTTP ステータスは常に 200** で、失敗時は本文が `{error:{code,message}}` になる。クライアントは「本文を全部読む → 先頭の `{` から `JSON.parse` → `error` キーがあればステータスに関わらずエラー扱い」にする。
- エラーコード: `unauthorized`(401) / `forbidden`(403) / `validation_error`(400) / `not_found`(404) / `conflict`(409) / `payload_too_large`(413) / `unsupported_media_type`(415) / `rate_limited`(429, `X-RateLimit-Limit/Remaining/Reset`(epoch 秒)) / `service_unavailable`(503) / `internal_error`(500)。
- 一覧はカーソルページング `limit`(既定 20, 最大 100) / `until` / `since`、応答 `pagination:{count,next,prev}`。時刻は epoch ms。
- デプロイ手順: `GET /workspaces` → `POST /uploads {workspaceId?,fileName,contentType:"application/zip"}` → 署名 URL へ `PUT`（Authorization なし、15 分有効）→ `POST /uploads/:id/check` body `{}` → `result.{checkId,canDeploy,errors[]}` → `POST /projects {workspaceId,name,source:{type:"zip",checkId},envs?,healthCheck?}` または `POST /projects/:id/deploy {source:{type:"zip",checkId}}` → `GET /projects/:id` を `latestDeployment.readyState` が `READY|ERROR` になるまでポーリング（`QUEUED|BUILDING` 継続、最大 15 分）。`checkId` は使い捨て。`errorCode` は `check_error|build_error|deploy_error|health_error`。
- `restart` は `{deployment:null,noop:true,message}` を返すことがある。
- env は `PATCH` の upsert のみ（削除 API なし）。`GET /env?decrypt=true` で値取得。
- logs: `limit`(≤500) / `since`(`-15m` or ISO) / `before` / `format=text`。ストリーミングなし。
- ZIP: サーバーは symlink を拒否、`node_modules .git .next dist build vendor __MACOSX .nuxt .output .svelte-kit .claude` を除去。言語判定は `composer.json`(PHP, Dockerfile 必須) > `package.json`(`scripts.start` 必須、dev コマンド不可) > `requirements.txt|pyproject.toml`。
- DB（beta、公開 docs 未掲載）: `GET /database`、`GET /database/tables` → `{tables:[{name,columns}]}`、`GET /database/tables/:table/rows?limit(1-100)&offset`。書込系・raw SQL なし。
- 権限: owner/admin/developer がデプロイ・env 編集、viewer は読取のみ、delete と DB 操作は owner/admin。

## 1. 技術選定

| 種別 | パッケージ                                                                                                                                                  | 理由                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| dep  | `commander`                                                                                                                                                 | サブコマンド・グローバルオプション・ヘルプ生成が揃った定番                                   |
| dep  | `@modelcontextprotocol/sdk` + `zod`                                                                                                                         | MCP 公式 SDK。zod は SDK の peer に合わせる                                                  |
| dep  | `yazl`                                                                                                                                                      | ストリーミング ZIP 書き出し。エントリを自前列挙するので symlink 除外・大容量でもメモリ非保持 |
| dep  | `ignore`                                                                                                                                                    | `.gitignore` / `.hanamiiignore` を正しく解釈                                                 |
| dep  | `@clack/prompts` + `picocolors`                                                                                                                             | トークンのマスク入力・スピナー・確認                                                         |
| HTTP | Node 20+ の global `fetch`。署名 URL への PUT だけ `node:https` + 明示 `Content-Length`（fetch のストリーム body は chunked になり署名 URL で拒否されうる） |
| dev  | `typescript` `tsup` `vitest` `msw` `eslint`(flat) `prettier` `@types/node` `@types/yazl`                                                                    |

`engines.node >= 20`、`"type":"module"`、`bin:{"hanamii":"dist/cli.js"}`、`files:["dist"]`。

## 2. ディレクトリ構成と責務

```
hanamii-cli/
  package.json tsconfig.json tsup.config.ts vitest.config.ts eslint.config.js
  README.md LICENSE TASKS.md REQUIREMENTS.md CHANGELOG.md
  .github/workflows/ci.yml release.yml
  src/
    cli.ts                 # bin エントリ（shebang は tsup banner）
    index.ts               # ライブラリ公開面（createClient, deploy）
    version.ts             # tsup define で package.json の version を埋め込む
    config/
      paths.ts             # $XDG_CONFIG_HOME|~/.config/hanamii、Windows は %APPDATA%
      store.ts             # config.json 読み書き（dir 0700 / file 0600）、baseUrl ごとに token
      resolve.ts           # 優先順位: --token > HANAMII_TOKEN > config。HANAMII_BASE_URL で base 上書き
      project-link.ts      # .hanamii/project.json {projectId,name,workspaceId}
    api/
      http.ts              # Bearer 付与、ストリーム本文読取→先頭空白除去→parse、body.error 検出、429 backoff、timeout
      errors.ts            # HanamiiApiError{status,code,message} / AuthError / RateLimitError / NetworkError
      types.ts             # Project, Deployment, Env, HealthCheck, Token, Upload, CheckResult, Database, Table, RowsPage
      client.ts            # createClient({token,baseUrl,fetch?}) → エンドポイント 1 関数ずつ
      upload-put.ts        # putZip(uploadUrl, zipPath, onProgress)
    zip/
      walk.ts              # lstat 列挙。symlink skip、既定除外、.gitignore/.hanamiiignore
      build.ts             # yazl で tmp ZIP → {zipPath,fileCount,bytes,skipped}
      precheck.ts          # 言語判定とローカル事前検証（サーバーと同じ順序・条件）
    core/                  # CLI と MCP の共通層。stdout に書かない（進捗は onEvent）
      workspace.ts         # 1 件→採用 / 0 件→未指定 / 複数→WorkspaceAmbiguousError
      project-resolve.ts   # prj_ 直指定 / 名前→一覧検索 / .hanamii/project.json
      deploy.ts            # precheck→zip→upload→put→check→create|deploy→wait
      poll.ts              # waitForDeployment(projectId,{timeoutMs,signal,onTick})
      logs.ts              # fetchLogs / followLogs（ポーリング＋重複排除）
      env.ts               # "K=V" 解析
    cli/
      context.ts output.ts # グローバル opts → client / 出力（human|--json）/ exit code
      commands/ login logout whoami workspaces projects deploy link env logs restart health-check tokens db mcp
    mcp/
      server.ts            # McpServer 生成、tools/resources/prompts 登録、StdioServerTransport
      tools/*.ts           # 1 ファイル 1 ツール（zod schema + handler）
      format.ts            # {content:[{type:'text'}], structuredContent}
  test/ unit api core cli mcp integration fixtures/sample-node-app/
```

MCP では stdout をプロトコル専用にし、ログは全て `console.error`。

## 3. HTTP クライアントの要点（`src/api/http.ts`）

- 全応答を `text()` → `text.slice(text.indexOf('{'))` → `JSON.parse`。2xx で空本文は `{}`。
- `parsed.error` があれば**ステータスに関わらず** `HanamiiApiError`。
- 429 は `X-RateLimit-Reset` まで待機（上限 60 秒、最大 3 回）。GET のみ 5xx/ネットワークエラーを 2 回再試行。
- 長時間 POST（check/create/deploy/restart）は `AbortSignal.timeout(20 分)`、他は 60 秒。
- `format=text` のログは text のまま返す分岐。
- トークンをログ・エラー・`--json` 出力に含めない。

## 4. CLI コマンド（全コマンド `--json` / `--token` / `--workspace` 対応）

| コマンド                                                                                                                                                   | 内容                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `login [--token hnm_..] [--no-browser]`                                                                                                                    | `https://hanamii.jp/account/settings/tokens` を開く → マスク入力 → `GET /user/tokens/current` で検証 → 保存 |
| `logout` / `whoami`                                                                                                                                        | 削除 / トークン名・scope・expiresAt・取得元(flag/env/config)                                                |
| `workspaces list`                                                                                                                                          |                                                                                                             |
| `projects list [--all]` / `projects get <id\|name>` / `projects create --name --git owner/repo --ref main [--root]` / `projects delete <id\|name> [--yes]` | delete は名前再入力で確認、202 は operationId 表示                                                          |
| `deploy [--name <n> \| --project <id\|name>] [--dir .] [--env K=V ...] [--git] [--no-wait] [--timeout 900] [--no-gitignore]`                               | 省略時は `.hanamii/project.json`。成功時にリンクファイルを書く。bash スクリプトの置き換え                   |
| `link <id\|name>` / `unlink`                                                                                                                               |                                                                                                             |
| `env list [--decrypt]` / `env set K=V ... [--plain] [--restart]`                                                                                           | 既定 secret。unset は API が無い旨を help に明記                                                            |
| `logs [--since -15m] [--limit 100] [--before ISO] [--follow]`                                                                                              | follow は 3 秒間隔ポーリング                                                                                |
| `restart` / `health-check get` / `health-check set --path /health [--port] \| --disable`                                                                   | restart は noop を区別                                                                                      |
| `tokens list` / `tokens create --name --scope full_account\|workspace [--expires 30d]` / `tokens revoke <id>`                                              | 平文は一度だけ表示                                                                                          |
| `db info` / `db tables` / `db rows <table> [--limit 50] [--offset 0]`                                                                                      | v1 は読取のみ                                                                                               |
| `mcp [--allow-delete]`                                                                                                                                     | stdio サーバー起動                                                                                          |
| `mcp install --client claude-code\|cursor\|codex\|claude-desktop [--run]`                                                                                  | 設定スニペット表示。`--run` は claude-code のみ `claude mcp add hanamii -- npx -y hanamii mcp`              |

プロジェクト解決: `prj_` 接頭辞→そのまま / 名前→`projects list` で検索（複数一致はエラー）/ 無指定→`.hanamii/project.json`。`.hanamii/` は ZIP から除外。

終了コード（bash スクリプト互換）: 0 成功 / 1 一般 / 2 使い方 / 3 認証 / 5 ローカル事前検証失敗 / 6 workspace 曖昧 / 8 check エラー / 10 デプロイ ERROR / 11 タイムアウト。

## 5. MCP ツール（`hanamii mcp`）

| ツール                                          | 入力 (zod)                                                                                       | 返却 / annotations                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `list_workspaces`                               | `{}`                                                                                             | readOnly                                                                               |
| `list_projects`                                 | `{workspaceId?, limit?(1-100)}`                                                                  | readOnly                                                                               |
| `get_project`                                   | `{project}`(id or name)                                                                          | url, latestDeployment, runtimeStatus。readOnly                                         |
| `deploy_project`                                | `{dir, name?, project?, workspaceId?, envs?:[{key,value,type?}], wait?=true, timeoutSec?(≤900)}` | `{projectId,url,readyState,errorCode,check?:{errors}}`。progressToken があれば進捗通知 |
| `wait_deployment`                               | `{project, timeoutSec?(≤600)}`                                                                   | 最終 readyState                                                                        |
| `get_logs`                                      | `{project, since?='-15m', limit?(≤500), before?}`                                                | text。readOnly                                                                         |
| `get_env`                                       | `{project, decrypt?=false}`                                                                      | 既定は key/type のみ、値はマスク                                                       |
| `set_env`                                       | `{project, envs[], restart?=false}`                                                              |                                                                                        |
| `restart_project`                               | `{project}`                                                                                      | deployment / noop                                                                      |
| `get_health_check` / `set_health_check`         | `{project}` / `{project,enabled,path?,port?}`                                                    |                                                                                        |
| `db_list_tables` / `db_query_rows`              | `{project}` / `{project,table,limit?(≤100),offset?}`                                             | readOnly                                                                               |
| `delete_project`（`--allow-delete` 時のみ登録） | `{project, confirmName}`                                                                         | 名前一致必須。destructiveHint                                                          |

リソース `hanamii://docs/public-api`（`https://hanamii.jp/docs/public-api.md` をキャッシュ）。プロンプト `deploy_app`（事前確認→deploy_project→失敗時 get_logs）。

## 6. エッジケース

- ZIP: symlink は skip して件数報告。`.env*` `.hanamii/` `*.zip` と既定除外（node_modules .git .next dist build vendor **pycache** .venv venv __MACOSX .DS_Store）。`.gitignore` 尊重（`--no-gitignore`）。空 ZIP はローカルでエラー。tmp ZIP は finally で削除。
- ZIP 作成後に `POST /uploads` を発行する（署名 URL 15 分の期限切れ回避）。
- checkId 使い捨て: create/deploy 失敗時の自動再試行はしない。
- 複数 workspace は自動選択せず exit 6 で一覧表示。workspace scope トークンは workspaceId 省略。
- 409 conflict は「`--project <name>` で再デプロイできます」を案内。
- Ctrl+C はポーリングのみ中断（デプロイ自体は継続と表示）。
- Windows: config パス、`open` は `start`。

## 7. テスト戦略

- unit: ストリーム JSON パース、`error` 判定、429 待機（fake timers）、config 優先順位と 0600、env 解析、walk（symlink/gitignore fixtures）、precheck、project 解決。
- api/core: `msw/node` で全エンドポイントをハンドラ化。check/create に先頭空白付き本文と 200+error を返させ、deploy フロー全体（READY / ERROR / timeout / check errors）を検証。PUT はローカル `node:http` サーバーで Content-Length と本文を検証。
- cli: commander を in-process 実行し stdout / exit code を検証。
- mcp: SDK の `InMemoryTransport` + `Client` でツール一覧とハンドラを呼ぶ。stdout に非プロトコル出力が無いことを検証。
- integration（`HANAMII_TOKEN` がある時のみ）: `tokens/current`・`workspaces`・`projects list` の読取。`HANAMII_E2E_DEPLOY=1` で fixtures の Node アプリを deploy→logs→delete。

## 8. ビルド・公開

- tsup: entry `src/cli.ts`(shebang banner) と `src/index.ts`、esm、target node20、deps は external。
- ci.yml: Node 20/22/24 で lint・typecheck・test・build・`node dist/cli.js --version`。
- release.yml: tag `v*` で `npm publish --provenance --access public`（`id-token: write`、NPM_TOKEN は GitHub Secrets）。
- リリース後: `npx -y hanamii@latest --version` と `npx -y hanamii mcp` の起動確認 → hanamii-skills の SKILL.md を `npx hanamii deploy` に切替 → hanamii-frontend の `public/llms.txt` と `docs/guides/deploy-with-agent.md` / `agent-deploy-api.md` の「CLI と MCP サーバーはありません」を更新（別 PR）。

## 9. フェーズ別タスク（新リポジトリの TASKS.md に転記）

```
Phase 0 足場
- [ ] ~/Documents/code/hanamii/hanamii-cli を作成、git init、GitHub に hanamii-sakura/hanamii-cli (public) を作成
- [ ] package.json / tsconfig / tsup / vitest / eslint / prettier / LICENSE / README 骨子 / TASKS.md / REQUIREMENTS.md
- [ ] src/version.ts と `hanamii --version` が動く、CI (ci.yml) が緑
Phase 1 設定と API
- [ ] config/paths + store + resolve（テスト: 優先順位、0600）
- [ ] api/http（ストリーム JSON、body.error、429 backoff、timeout）+ errors
- [ ] api/client 全エンドポイント + types（msw テスト）
- [ ] login / logout / whoami / workspaces list
Phase 2 デプロイ
- [ ] zip/walk + build + precheck（fixtures）
- [ ] api/upload-put（ローカル http サーバーで検証）
- [ ] core/workspace, project-resolve, project-link
- [ ] core/deploy + poll + `deploy` コマンド（--no-wait / --timeout / --env / --git）
- [ ] projects list/get/create/delete, link/unlink
Phase 3 運用コマンド
- [ ] env list/set, logs(+follow), restart, health-check, tokens
- [ ] db info/tables/rows
Phase 4 MCP
- [ ] mcp/server + 読取系ツール（InMemoryTransport テスト）
- [ ] deploy_project / wait_deployment（progress 通知）、set_env、restart、delete(opt-in)
- [ ] resource / prompt、`mcp install`
Phase 5 仕上げ
- [ ] 統合テスト（HANAMII_TOKEN ゲート）、README（JA/EN）
- [ ] release.yml で v0.1.0 公開、npx 検証
- [ ] hanamii-skills を `npx hanamii deploy` に切替、hanamii-frontend の llms.txt / ガイドの文言更新（別 PR）
- [ ] projects_index.md に hanamii-cli を追記
```

## 検証（E2E）

1. `npm run build && node dist/cli.js --version`
2. `hanamii login`（本番トークン）→ `hanamii whoami` → `hanamii workspaces list --json`
3. `test/fixtures/sample-node-app` で `hanamii deploy --name cli-smoke-<date>` → URL が返る → `hanamii logs --since -5m` → `hanamii env set FOO=bar --restart` → `hanamii projects delete cli-smoke-<date>`
4. `claude mcp add hanamii -- node <repo>/dist/cli.js mcp` を Claude Code に登録し、`list_projects` / `get_logs` / `deploy_project` を実行
5. `npm run test` 全件緑、`HANAMII_TOKEN` 付きで integration も緑

## 重要ファイル（実装の中核）

- `hanamii-cli/src/api/http.ts`（ストリーム本文・error 判定・429）
- `hanamii-cli/src/core/deploy.ts`（CLI/MCP 共通のデプロイ手順）
- `hanamii-cli/src/zip/walk.ts`（除外・symlink・gitignore）
- `hanamii-cli/src/mcp/server.ts`（ツール登録と stdio）
- `hanamii-cli/src/config/store.ts`（トークン保存と優先順位）

参照元: `hanamii-frontend/src/server/public-api/http/publicApi.ts`、`hanamii-frontend/docs/public-api/公開API仕様.md`、`hanamii-skills/skills/hanamii-deploy/scripts/hanamii-deploy.sh`
