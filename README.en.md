# hanamii CLI / MCP server

English | [日本語](README.md)

Deploy to [hanamii](https://hanamii.jp), a Japanese PaaS operated by HANAMII, Inc., from your terminal or AI agent. The `hanamii` npm package includes a CLI and a local stdio MCP server. Both use the public REST API v1.

## Requirements

Node.js 20.3+ and npm. Deployments require a hanamii account and an API token with the necessary permissions in the target workspace.

## Installation

Run without installing globally:

```bash
npx hanamii --help
```

Or install globally. The examples below use this form.

```bash
npm i -g hanamii
hanamii --help
```

## Getting started

Run in your application directory. Node.js apps need a production `scripts.start` command.

```bash
hanamii login
hanamii deploy --name my-app
```

`login` opens the token issuance page in your browser, accepts masked input, validates the token, and saves it. When the deployment reaches READY, the CLI prints the public URL and saves a link in `.hanamii/project.json`. Run `hanamii deploy` to deploy again.

If you have multiple workspaces, find the ID with `hanamii workspaces list` and use `hanamii deploy --name my-app --workspace <id>`.

## Authentication

Token precedence is `--token` > `HANAMII_TOKEN` > configuration file. Create a token on the [token issuance page](https://hanamii.jp/account/settings/tokens).

The default configuration path is `~/.config/hanamii/config.json`, or `$XDG_CONFIG_HOME/hanamii/config.json` when set. On Windows it is `%APPDATA%/hanamii/config.json`. Tokens are stored per base URL, with file permissions of 0600.

Set `HANAMII_BASE_URL` to change the server (default: `https://hanamii.jp`; `/api/v1` is appended automatically). `logout` removes only the saved token for the current server; it does not change environment variables or revoke tokens on the server.

`login` saves a token from interactive input or `--token`. To save it noninteractively, use `hanamii login --token "$HANAMII_TOKEN"`. No login is needed when authenticating directly through the environment variable.

## Commands

Global options: `--json` (JSON output), `--token <token>`, `--workspace <id>`, and `-h, --help`. Use `hanamii -v` / `hanamii --version` for the version. Each subcommand also supports `--help`.

Below, `<id-or-name>` means a project UUID or name. `env`, `logs`, `restart`, `health-check`, and `db` accept `--project <id-or-name>`; when omitted, they use the current directory's project link.

| Command                                | Options and behavior                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hanamii login`                        | `--no-browser`. Validate and save a token. `--token` skips interactive input                                                                                                                                                                                                 |
| `hanamii logout`                       | Remove the saved token for the current server                                                                                                                                                                                                                                |
| `hanamii whoami`                       | Show the current token's name, scope, expiry, and source                                                                                                                                                                                                                     |
| `hanamii workspaces list`              | List accessible workspace IDs, names, and roles                                                                                                                                                                                                                              |
| `hanamii deploy`                       | `--name <name>` (new) or `--project <id-or-name>` (redeploy); defaults to the linked project. `--dir <dir>` (default `.`), repeatable `--env <K=V>` (secret), `--git` (redeploy existing Git source), `--no-wait`, `--timeout <seconds>` (default/max 900), `--no-gitignore` |
| `hanamii link <id-or-name>`            | Link the current directory to an existing project                                                                                                                                                                                                                            |
| `hanamii unlink`                       | Remove the local link                                                                                                                                                                                                                                                        |
| `hanamii projects list`                | `--all` fetches all pages; otherwise one page                                                                                                                                                                                                                                |
| `hanamii projects get <id-or-name>`    | Show details, URL, deployment, and runtime status                                                                                                                                                                                                                            |
| `hanamii projects create`              | Required: `--name <name> --git <owner/repo> --ref <ref>`. Optional: `--root <directory>`. Create from GitHub and start the first deployment (does not wait for completion or save a local link)                                                                              |
| `hanamii projects delete <id-or-name>` | Confirm by retyping the name. `--yes` skips confirmation and is required noninteractively                                                                                                                                                                                    |
| `hanamii env list`                     | Show key/type; `--decrypt` also shows values                                                                                                                                                                                                                                 |
| `hanamii env set <K=V...>`             | Add or update variables (secret by default). `--plain`, `--restart` (restart after saving)                                                                                                                                                                                   |
| `hanamii logs`                         | `--since <time>` (default `-15m`, relative or ISO), `--limit <count>` (default 100, 1–500), `--before <ISO>`, `--follow` (every 3 seconds). `--json --follow` emits an array of new logs on each line                                                                        |
| `hanamii restart`                      | Apply saved configuration; report noop when no restart is needed                                                                                                                                                                                                             |
| `hanamii health-check get`             | Read configuration                                                                                                                                                                                                                                                           |
| `hanamii health-check set`             | `--path <path>` (starting with `/`) and optional `--port <port>` (1–65535), or `--disable`. Restart or redeploy to apply                                                                                                                                                     |
| `hanamii tokens list`                  | Show one page of token metadata                                                                                                                                                                                                                                              |
| `hanamii tokens create`                | Required: `--name <name> --scope <scope>`. Scope: `full_account` / `workspace`. `--workspace <id>`, `--expires <expires>` (`30d` / `90d` / future `YYYY-MM-DD` at UTC 00:00; no expiry if omitted)                                                                           |
| `hanamii tokens revoke <id>`           | Revoke a token                                                                                                                                                                                                                                                               |
| `hanamii db info`                      | Database information                                                                                                                                                                                                                                                         |
| `hanamii db tables`                    | Tables and column definitions                                                                                                                                                                                                                                                |
| `hanamii db rows <table>`              | `--limit <count>` (default 50, 1–100), `--offset <count>` (default 0, 0–1000000)                                                                                                                                                                                             |
| `hanamii mcp`                          | Start the stdio server. `--allow-delete` enables the deletion tool                                                                                                                                                                                                           |
| `hanamii mcp install`                  | Required: `--client <client>` (`claude-code` / `cursor` / `codex` / `claude-desktop`). Print configuration snippets. `--run` only supports executing the Claude Code registration command                                                                                    |

`deploy --name` and `--project` are mutually exclusive. Use `projects create` for new Git projects; `--git --name` is not supported. `--no-wait` prints the project ID without waiting for the final URL.

## How deployment works

Local validation → temporary ZIP → upload to a signed URL → server validation → create or redeploy → poll until READY / ERROR. The temporary ZIP is removed on exit. Ctrl+C interrupts waiting; a deployment that has already started continues.

Default ZIP exclusions: `node_modules`, `.git`, `.next`, `dist`, `build`, `vendor`, `__pycache__`, `.venv`, `venv`, `__MACOSX`, `.DS_Store`, `.env*`, `.hanamii/`, and `*.zip`. Symlinks are skipped.

The CLI applies `.gitignore` and `.hanamiiignore` at each directory level using gitignore syntax. `--no-gitignore` disables only `.gitignore`. Negated patterns cannot override default exclusions, and `.hanamiiignore` cannot undo `.gitignore` exclusions. For example:

```gitignore
test/
docs/
*.log
```

Language detection checks root files remaining after exclusions, in this order:

1. `composer.json` → PHP. Requires a `Dockerfile` with a numeric `EXPOSE`. PHP-FPM alone is insufficient. Laravel requires `public/index.php`.
2. `package.json` → Node.js. Requires a nonempty `scripts.start`; commands containing `dev` are rejected. A TypeScript dependency also requires `@types/node`.
3. `requirements.txt` or `pyproject.toml` → Python. Including `Pipfile` / `Pipfile.lock` is not supported.

Empty ZIPs and unknown languages fail local validation. A successful `deploy`, including `--no-wait`, saves projectId/name/workspaceId in `.hanamii/project.json` under the target directory. You can also manage the link with `link` / `unlink`.

## Exit codes

| Code | Meaning                           |
| ---- | --------------------------------- |
| 0    | Success, including help / version |
| 1    | General error                     |
| 2    | Usage or argument error           |
| 3    | Authentication error              |
| 5    | Local validation failure          |
| 6    | Ambiguous workspace               |
| 8    | Server ZIP check failure          |
| 10   | Deployment ERROR                  |
| 11   | Timeout                           |

## MCP server

Run `hanamii mcp` to start a local stdio server. stdout is reserved for the protocol; logs use stderr. Pass `HANAMII_TOKEN` to the server process through its environment.

```bash
hanamii mcp install --client claude-code
hanamii mcp install --client cursor
hanamii mcp install --client codex
hanamii mcp install --client claude-desktop
```

Add this configuration to `.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, or `claude_desktop_config.json` for Claude Desktop. `<YOUR_HANAMII_TOKEN>` is a placeholder to replace locally.

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

For Codex, set the environment variable before launching it and add this to `~/.codex/config.toml`:

```toml
[mcp_servers.hanamii]
command = "npx"
args = ["-y", "hanamii", "mcp"]
env_vars = ["HANAMII_TOKEN"]
```

`hanamii mcp install --client claude-code --run` executes `claude mcp add hanamii -- npx -y hanamii mcp`. When using it, pass the environment variable to Claude Code or run `hanamii login` beforehand. Other clients' configuration files are not updated automatically.

| Tool               | Input and behavior                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `list_workspaces`  | No input; list workspaces                                                                                                |
| `list_projects`    | Optional: `workspaceId`, `limit` (1–100)                                                                                 |
| `get_project`      | `project` (UUID or name)                                                                                                 |
| `deploy_project`   | `dir`; optional: `name` / `project`, `workspaceId`, `envs`, `wait` (default true), `timeoutSec` (default/max 900)        |
| `wait_deployment`  | `project`, `timeoutSec` (default/max 600); wait for READY / ERROR                                                        |
| `get_logs`         | `project`, `since` (default `-15m`), `limit` (default 100, 1–500); optional: `before`                                    |
| `get_env`          | `project`, `decrypt` (default false, key/type only)                                                                      |
| `set_env`          | `project`, `envs`, `restart` (default false)                                                                             |
| `restart_project`  | `project`                                                                                                                |
| `get_health_check` | `project`                                                                                                                |
| `set_health_check` | `project`, `enabled`; optional: `path`, `port`. Enabling requires a path starting with `/`. Restart or redeploy to apply |
| `db_list_tables`   | `project`                                                                                                                |
| `db_query_rows`    | `project`, `table`, `limit` (default 50, 1–100), `offset` (default 0, 0–1000000). No SQL                                 |
| `delete_project`   | `project`, `confirmName` matching the current project name. Registered only with `--allow-delete`                        |

`envs` is an array of `{key, value, type?}`; type is `secret` (default) or `plain`. Add `--allow-delete` to the server arguments to enable deletion. `deploy_project` / `wait_deployment` send progress notifications when a progressToken is provided.

The server also provides the `hanamii://docs/public-api` resource and the `deploy_app` prompt for deployment guidance.

## For AI agents

Use CLI `--json` for machine-readable results. Authentication tokens are masked in normal output and errors. The explicit `tokens create` operation is the exception: it displays the newly issued token once, including a `bearerToken` field with `--json`.

## Limitations

- Environment variables can only be added or updated. There is no deletion API or `env unset`.
- Database access is read-only; writes and raw SQL are not provided.
- Logs are runtime logs. Following uses polling, not streaming.
- MCP supports local stdio only.

## Development

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm run test:integration
```

Regular tests exclude integration tests. Format with `npm run format`.

Integration tests connect to the real API only when `HANAMII_TOKEN` is set, checking token metadata, workspaces, and project listings. Without it, all tests are skipped. `...` below is a placeholder.

```bash
HANAMII_TOKEN=... npm run test:integration
```

Override the server with `HANAMII_BASE_URL` (default `https://hanamii.jp`). Also set `HANAMII_E2E_DEPLOY=1` and `HANAMII_E2E_WORKSPACE` (workspace ID) to deploy `test/fixtures/sample-node-app` as `cli-it-<epoch-seconds>` and check logs, secret environment variables, and restart. Deployment waiting is capped at 600 seconds; the test timeout is 15 minutes. Teardown attempts to delete the created project and remove the local link even after failures, and verifies not_found after deletion. Integration tests are not run in CI.

## License

[MIT](LICENSE)
