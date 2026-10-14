# hanamii CLI / MCP サーバー

[English](README.en.md) | 日本語

[hanamii](https://hanamii.jp)（HANAMII株式会社が運営する国産 PaaS）に、ターミナルや AI エージェントからデプロイするツールです。npm パッケージ `hanamii` に CLI とローカル stdio MCP サーバーを同梱しています。公開 REST API v1 を使用します。

## 必要環境

Node.js 20.3 以上と npm。デプロイには hanamii のアカウントと、対象ワークスペースで必要な権限を持つ API トークンが必要です。

## インストール

インストールせずに実行できます。

```bash
npx hanamii --help
```

またはグローバルにインストールします。以下の例はこの形式です。

```bash
npm i -g hanamii
hanamii --help
```

## はじめかた

アプリのディレクトリで実行します。Node.js アプリには本番用の `scripts.start` が必要です。

```bash
hanamii login
hanamii deploy --name my-app
```

`login` はブラウザでトークン発行ページを開き、マスク入力したトークンを検証・保存します。デプロイが READY になると公開 URL を表示し、`.hanamii/project.json` にリンクを保存します。次回は `hanamii deploy` だけで再デプロイできます。

ワークスペースが複数ある場合は `hanamii workspaces list` で ID を確認し、`hanamii deploy --name my-app --workspace <id>` を指定してください。

## 認証

トークンの優先順位は `--token` > `HANAMII_TOKEN` > 設定ファイルです。[トークン発行ページ](https://hanamii.jp/account/settings/tokens)で発行できます。

保存先は既定で `~/.config/hanamii/config.json`、`XDG_CONFIG_HOME` 設定時は `$XDG_CONFIG_HOME/hanamii/config.json`、Windows は `%APPDATA%/hanamii/config.json` です。トークンは接続先ごとに保存し、ファイルの権限は 0600 です。

`HANAMII_BASE_URL` で接続先を変更できます（既定 `https://hanamii.jp`、`/api/v1` は自動で付加）。`logout` は現在の接続先の保存済みトークンだけを削除し、環境変数やサーバー上のトークンは変更しません。

`login` 自体は対話入力または `--token` で保存します。非対話での保存には `hanamii login --token "$HANAMII_TOKEN"` を使えます。環境変数で認証するだけなら `login` は不要です。

## コマンド一覧

共通オプション: `--json`（JSON 出力）、`--token <token>`、`--workspace <id>`、`-h, --help`。バージョンは `hanamii -v` / `hanamii --version`。各サブコマンドにも `--help` があります。

以下の `<id-or-name>` はプロジェクトの UUID または名前です。`env`、`logs`、`restart`、`health-check`、`db` は `--project <id-or-name>` で対象を指定でき、省略時はカレントディレクトリのリンクを使います。

| コマンド                               | オプションと動作                                                                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hanamii login`                        | `--no-browser`。トークンを検証して保存。`--token` 指定時は対話を省略                                                                                                                                                                                                    |
| `hanamii logout`                       | 現在の接続先の保存済みトークンを削除                                                                                                                                                                                                                                    |
| `hanamii whoami`                       | 現在のトークン名・スコープ・期限・取得元を表示                                                                                                                                                                                                                          |
| `hanamii workspaces list`              | アクセス可能なワークスペースの ID・名前・role                                                                                                                                                                                                                           |
| `hanamii deploy`                       | `--name <name>`（新規）または `--project <id-or-name>`（再デプロイ）。省略時はリンク先。`--dir <dir>`（既定 `.`）、`--env <K=V>`（繰り返し可、secret）、`--git`（既存 Git ソースで再デプロイ）、`--no-wait`、`--timeout <seconds>`（既定・最大900秒）、`--no-gitignore` |
| `hanamii link <id-or-name>`            | カレントディレクトリを既存プロジェクトに紐づける                                                                                                                                                                                                                        |
| `hanamii unlink`                       | ローカルリンクを削除                                                                                                                                                                                                                                                    |
| `hanamii projects list`                | `--all` で全ページ取得。省略時は1ページ                                                                                                                                                                                                                                 |
| `hanamii projects get <id-or-name>`    | 詳細・URL・デプロイ・ランタイム状態                                                                                                                                                                                                                                     |
| `hanamii projects create`              | 必須: `--name <name> --git <owner/repo> --ref <ref>`。任意: `--root <directory>`。GitHub から新規作成・初回デプロイ開始（完了待機・ローカルリンク保存なし）                                                                                                             |
| `hanamii projects delete <id-or-name>` | 名前の再入力で削除。`--yes` で確認省略（非対話では必須）                                                                                                                                                                                                                |
| `hanamii env list`                     | key/type を表示。`--decrypt` で値も表示                                                                                                                                                                                                                                 |
| `hanamii env set <K=V...>`             | 追加・更新（既定 secret）。`--plain`、`--restart`（保存後に再起動）                                                                                                                                                                                                     |
| `hanamii logs`                         | `--since <time>`（既定 `-15m`、相対時間または ISO）、`--limit <count>`（既定100、1〜500）、`--before <ISO>`、`--follow`（3秒間隔）。`--json --follow` は差分の logs 配列を1行ずつ出力                                                                                   |
| `hanamii restart`                      | 保存済み設定を反映。変更がない場合は再起動不要（noop）を表示                                                                                                                                                                                                            |
| `hanamii health-check get`             | 設定を取得                                                                                                                                                                                                                                                              |
| `hanamii health-check set`             | `--path <path>`（`/` 始まり）と任意の `--port <port>`（1〜65535）、または `--disable`。反映には restart または再デプロイが必要                                                                                                                                          |
| `hanamii tokens list`                  | トークンのメタデータを1ページ表示                                                                                                                                                                                                                                       |
| `hanamii tokens create`                | 必須: `--name <name> --scope <scope>`。scope は `full_account` / `workspace`。`--workspace <id>`、`--expires <expires>`（`30d` / `90d` / 未来の `YYYY-MM-DD` UTC 00:00、省略時は無期限）                                                                                |
| `hanamii tokens revoke <id>`           | トークンを失効                                                                                                                                                                                                                                                          |
| `hanamii db info`                      | データベース情報                                                                                                                                                                                                                                                        |
| `hanamii db tables`                    | テーブルと列定義                                                                                                                                                                                                                                                        |
| `hanamii db rows <table>`              | `--limit <count>`（既定50、1〜100）、`--offset <count>`（既定0、0〜1000000）                                                                                                                                                                                            |
| `hanamii mcp`                          | stdio サーバーを起動。`--allow-delete` で削除ツールを有効化                                                                                                                                                                                                             |
| `hanamii mcp install`                  | 必須: `--client <client>`（`claude-code` / `cursor` / `codex` / `claude-desktop`）。設定スニペットを表示。`--run` は claude-code の登録コマンド実行のみ対応                                                                                                             |

`deploy --name` と `--project` は併用できません。`--git --name` による新規作成には対応せず、`projects create` を使います。`--no-wait` は完了 URL を待たずプロジェクト ID を表示します。

## デプロイの仕組み

ローカル事前検証 → 一時 ZIP 作成 → 署名 URL にアップロード → サーバー検証 → 新規作成または再デプロイ → READY / ERROR までポーリング、の順に処理します。一時 ZIP は終了時に削除します。Ctrl+C は完了待機を中断しますが、開始済みデプロイは継続します。

ZIP の既定除外は `node_modules`、`.git`、`.next`、`dist`、`build`、`vendor`、`__pycache__`、`.venv`、`venv`、`__MACOSX`、`.DS_Store`、`.env*`、`.hanamii/`、`*.zip`。symlink はスキップします。

各階層の `.gitignore` と `.hanamiiignore` を適用します（gitignore 形式）。`--no-gitignore` は `.gitignore` の適用だけを止めます。既定除外は否定パターンでも解除できず、`.hanamiiignore` で `.gitignore` の除外を解除することもできません。例えば `.hanamiiignore` に次を追加できます。

```gitignore
test/
docs/
*.log
```

言語判定は、除外後のルートファイルを次の優先順で調べます。

1. `composer.json` → PHP。`Dockerfile` と数値の `EXPOSE` が必要。PHP-FPM 単体は不可。Laravel には `public/index.php` が必要。
2. `package.json` → Node.js。空でない `scripts.start` が必要で、`dev` を含むコマンドは不可。TypeScript 依存がある場合は `@types/node` も必要。
3. `requirements.txt` または `pyproject.toml` → Python。`Pipfile` / `Pipfile.lock` の同梱は不可。

空 ZIP・言語不明は事前検証エラーです。成功した `deploy`（`--no-wait` を含む）は対象ディレクトリの `.hanamii/project.json` に projectId/name/workspaceId を保存します。`link` / `unlink` でも管理できます。

## 終了コード

| コード | 意味                          |
| ------ | ----------------------------- |
| 0      | 成功（help / version を含む） |
| 1      | 一般エラー                    |
| 2      | 使い方・引数エラー            |
| 3      | 認証エラー                    |
| 5      | ローカル事前検証失敗          |
| 6      | ワークスペースが曖昧          |
| 8      | サーバーの ZIP check エラー   |
| 10     | デプロイ ERROR                |
| 11     | タイムアウト                  |

## MCP サーバー

`hanamii mcp` でローカル stdio サーバーを起動します。stdout はプロトコル専用、ログは stderr です。サーバープロセスに `HANAMII_TOKEN` を環境変数で渡してください。

```bash
hanamii mcp install --client claude-code
hanamii mcp install --client cursor
hanamii mcp install --client codex
hanamii mcp install --client claude-desktop
```

Claude Code は `.mcp.json`、Cursor は `.cursor/mcp.json`、Claude Desktop は `claude_desktop_config.json` に次の設定を追加します。`<YOUR_HANAMII_TOKEN>` はプレースホルダーで、手元で置き換えます。

```json
{
  "mcpServers": {
    "hanamii": {
      "command": "npx",
      "args": ["-y", "hanamii", "mcp"],
      "env": { "HANAMII_TOKEN": "<YOUR_HANAMII_TOKEN>" }
    }
  }
}
```

Codex は起動前に環境変数を設定し、`~/.codex/config.toml` に次を追加します。

```toml
[mcp_servers.hanamii]
command = "npx"
args = ["-y", "hanamii", "mcp"]
env_vars = ["HANAMII_TOKEN"]
```

`hanamii mcp install --client claude-code --run` は `claude mcp add hanamii -- npx -y hanamii mcp` を実行します。利用時は Claude Code に環境変数を渡すか、事前に `hanamii login` を実行してください。他のクライアントの設定ファイルは自動更新しません。

| ツール             | 入力・動作                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `list_workspaces`  | 入力なし。ワークスペース一覧                                                                                  |
| `list_projects`    | 任意: `workspaceId`、`limit`（1〜100）                                                                        |
| `get_project`      | `project`（UUID または名前）                                                                                  |
| `deploy_project`   | `dir`、任意: `name` / `project`、`workspaceId`、`envs`、`wait`（既定 true）、`timeoutSec`（既定・最大900）    |
| `wait_deployment`  | `project`、`timeoutSec`（既定・最大600）。READY / ERROR まで待機                                              |
| `get_logs`         | `project`、`since`（既定 `-15m`）、`limit`（既定100、1〜500）、任意: `before`                                 |
| `get_env`          | `project`、`decrypt`（既定 false、key/type のみ）                                                             |
| `set_env`          | `project`、`envs`、`restart`（既定 false）                                                                    |
| `restart_project`  | `project`                                                                                                     |
| `get_health_check` | `project`                                                                                                     |
| `set_health_check` | `project`、`enabled`、任意: `path`、`port`。有効化時は `/` 始まりの path 必須。反映には再起動または再デプロイ |
| `db_list_tables`   | `project`                                                                                                     |
| `db_query_rows`    | `project`、`table`、`limit`（既定50、1〜100）、`offset`（既定0、0〜1000000）。SQL は不可                      |
| `delete_project`   | `project`、現在の名前と一致する `confirmName`。`--allow-delete` 指定時だけ登録                                |

`envs` は `{key, value, type?}` の配列で、type は `secret`（既定）または `plain` です。削除を有効にする場合は起動引数に `--allow-delete` を追加します。`deploy_project` / `wait_deployment` は progressToken がある場合に進捗を通知します。

リソース `hanamii://docs/public-api` と、デプロイ手順を案内するプロンプト `deploy_app` も提供します。

## AI エージェント向け

CLI の `--json` で機械可読な結果を取得できます。通常の出力・エラーでは認証トークンをマスクします。例外として、明示的な `tokens create` は発行したトークンを一度だけ表示し、`--json` でも `bearerToken` を返します。

## 制限事項

- 環境変数は追加・更新のみ。削除 API がないため `env unset` はありません。
- DB は読取専用。書込・raw SQL は提供しません。
- ログはランタイムログで、追跡はポーリングです。ストリーミングではありません。
- MCP はローカル stdio のみです。

## 開発

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run test:integration
```

通常テストは統合テストを除外します。整形は `npm run format`。

統合テストは `HANAMII_TOKEN` があるときだけ実 API に接続し、トークンメタデータ・ワークスペース・プロジェクト一覧を確認します。未設定なら全件スキップします。次の `...` はプレースホルダーです。

```bash
HANAMII_TOKEN=... npm run test:integration
```

`HANAMII_BASE_URL` で接続先を変更できます（既定 `https://hanamii.jp`）。さらに `HANAMII_E2E_DEPLOY=1` と `HANAMII_E2E_WORKSPACE`（workspace ID）を設定すると、`test/fixtures/sample-node-app` を `cli-it-<epoch秒>` として新規デプロイし、ログ・secret 環境変数・再起動を確認します。デプロイ待機は600秒、テストの上限は15分です。終了時は失敗しても作成済みプロジェクトの削除とローカルリンクの除去を試み、削除後の not_found を検証します。統合テストは CI では実行しません。

## ライセンス

[MIT](LICENSE)
