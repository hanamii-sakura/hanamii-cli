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

| Command                                          | Options and behavior                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hanamii login`                                  | `--no-browser`. Validate and save a token. `--token` skips interactive input                                                                                                                                                                                                 |
| `hanamii logout`                                 | Remove the saved token for the current server                                                                                                                                                                                                                                |
| `hanamii whoami`                                 | Show the current token's name, scope, expiry, and source                                                                                                                                                                                                                     |
| `hanamii workspaces list`                        | List accessible workspace IDs, names, and roles                                                                                                                                                                                                                              |
| `hanamii deploy`                                 | `--name <name>` (new) or `--project <id-or-name>` (redeploy); defaults to the linked project. `--dir <dir>` (default `.`), repeatable `--env <K=V>` (secret), `--git` (redeploy existing Git source), `--no-wait`, `--timeout <seconds>` (default/max 900), `--no-gitignore` |
| `hanamii link <id-or-name>`                      | Link the current directory to an existing project                                                                                                                                                                                                                            |
| `hanamii unlink`                                 | Remove the local link                                                                                                                                                                                                                                                        |
| `hanamii projects list`                          | `--all` fetches all pages; otherwise one page                                                                                                                                                                                                                                |
| `hanamii projects get <id-or-name>`              | Show details, URL, deployment, and runtime status                                                                                                                                                                                                                            |
| `hanamii projects create`                        | Required: `--name <name> --git <owner/repo> --ref <ref>`. Optional: `--root <directory>`. Create from GitHub and start the first deployment (does not wait for completion or save a local link)                                                                              |
| `hanamii projects delete <id-or-name>`           | Confirm by retyping the name. `--yes` skips confirmation and is required noninteractively                                                                                                                                                                                    |
| `hanamii env list`                               | Show key/type; `--decrypt` also shows values                                                                                                                                                                                                                                 |
| `hanamii env set <K=V...>`                       | Add or update variables (secret by default). `--plain`, `--restart` (restart after saving)                                                                                                                                                                                   |
| `hanamii logs`                                   | `--since <time>` (default `-15m`, relative or ISO), `--limit <count>` (default 100, 1–500), `--before <ISO>`, `--follow` (every 3 seconds). `--json --follow` emits an array of new logs on each line                                                                        |
| `hanamii restart`                                | Apply saved configuration; report noop when no restart is needed                                                                                                                                                                                                             |
| `hanamii health-check get`                       | Read configuration                                                                                                                                                                                                                                                           |
| `hanamii health-check set`                       | `--path <path>` (starting with `/`) and optional `--port <port>` (1–65535), or `--disable`. Restart or redeploy to apply                                                                                                                                                     |
| `hanamii tokens list`                            | Show one page of token metadata                                                                                                                                                                                                                                              |
| `hanamii tokens create`                          | Required: `--name <name> --scope <scope>`. Scope: `full_account` / `workspace`. `--workspace <id>`, `--expires <expires>` (`30d` / `90d` / future `YYYY-MM-DD` at UTC 00:00; no expiry if omitted)                                                                           |
| `hanamii tokens revoke <id>`                     | Revoke a token                                                                                                                                                                                                                                                               |
| `hanamii db info`                                | Database information                                                                                                                                                                                                                                                         |
| `hanamii db tables`                              | Tables and column definitions                                                                                                                                                                                                                                                |
| `hanamii db rows <table>`                        | `--limit <count>` (default 50, 1–100), `--offset <count>` (default 0, 0–1000000)                                                                                                                                                                                             |
| `hanamii db create`                              | Optional `--name <name>`. Create an empty database; check completion with `db info`                                                                                                                                                                                          |
| `hanamii db delete`                              | Retype the database name to delete; `--yes` skips confirmation and is required noninteractively                                                                                                                                                                              |
| `hanamii db tokens list`                         | List database connection token metadata                                                                                                                                                                                                                                      |
| `hanamii db tokens create`                       | `--name <name>`, `--permission <permission>` (read_write by default, or read_only), `--ttl <seconds>` (default 2592000). Plaintext only at issuance                                                                                                                          |
| `hanamii db tokens revoke <tokenId>`             | Revoke a database connection token                                                                                                                                                                                                                                           |
| `hanamii db export`                              | `--idempotency-key <key>`, `--job <id>` (resume), `--no-wait`, `--timeout <seconds>` (default/max 900). Return a signed URL when ready; `--output <file>` verifies and saves without overwriting                                                                             |
| `hanamii db import <file>`                       | Create a database from a SQLite file up to 100 MiB. Optional `--name <name>`; check completion with `db info`                                                                                                                                                                |
| `hanamii storage buckets list`                   | List buckets; `--cursor <cursor>` fetches the next page                                                                                                                                                                                                                      |
| `hanamii storage buckets create <name>`          | Required `--visibility <visibility>` (public / private; immutable after creation)                                                                                                                                                                                            |
| `hanamii storage buckets delete <bucket>`        | Retype the bucket name to delete; `--yes` skips confirmation and is required noninteractively                                                                                                                                                                                |
| `hanamii storage keys list <bucket>`             | List access keys; `--cursor <cursor>` fetches the next page                                                                                                                                                                                                                  |
| `hanamii storage keys create <bucket>`           | Required `--permission <permission>` (read_only / read_write). Show the key only at issuance                                                                                                                                                                                 |
| `hanamii storage keys revoke <bucket> <keyId>`   | Revoke an access key                                                                                                                                                                                                                                                         |
| `hanamii storage files list <bucket>`            | List files; `--cursor <cursor>` fetches the next page                                                                                                                                                                                                                        |
| `hanamii storage files url <bucket> <fileId>`    | Issue a view URL (private: one hour; public: permanent)                                                                                                                                                                                                                      |
| `hanamii storage files upload <bucket> <path>`   | Optional `--name <name>`, `--content-type <type>`. Detect MIME from extension; upload with a temporary key and revoke it                                                                                                                                                     |
| `hanamii storage files delete <bucket> <fileId>` | Retype the file name to delete; `--yes` skips confirmation and is required noninteractively                                                                                                                                                                                  |
| `hanamii storage usage`                          | Show usage and limits; byte counts and file counts are decimal strings                                                                                                                                                                                                       |
| `hanamii mcp`                                    | Start the stdio server. `--allow-delete` enables the deletion tools                                                                                                                                                                                                          |
| `hanamii mcp install`                            | Required: `--client <client>` (`claude-code` / `cursor` / `codex` / `claude-desktop`). Print configuration snippets. `--run` only supports executing the Claude Code registration command                                                                                    |

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

| Tool                        | Input and behavior                                                                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_workspaces`           | No input; list workspaces                                                                                                                                      |
| `list_projects`             | Optional: `workspaceId`, `limit` (1–100)                                                                                                                       |
| `get_project`               | `project` (UUID or name)                                                                                                                                       |
| `deploy_project`            | `dir`; optional: `name` / `project`, `workspaceId`, `envs`, `wait` (default true), `timeoutSec` (default/max 900)                                              |
| `wait_deployment`           | `project`, `timeoutSec` (default/max 600); wait for READY / ERROR                                                                                              |
| `get_logs`                  | `project`, `since` (default `-15m`), `limit` (default 100, 1–500); optional: `before`                                                                          |
| `get_env`                   | `project`, `decrypt` (default false, key/type only)                                                                                                            |
| `set_env`                   | `project`, `envs`, `restart` (default false)                                                                                                                   |
| `restart_project`           | `project`                                                                                                                                                      |
| `get_health_check`          | `project`                                                                                                                                                      |
| `set_health_check`          | `project`, `enabled`; optional: `path`, `port`. Enabling requires a path starting with `/`. Restart or redeploy to apply                                       |
| `db_list_tables`            | `project`                                                                                                                                                      |
| `db_query_rows`             | `project`, `table`, `limit` (default 50, 1–100), `offset` (default 0, 0–1000000). No SQL                                                                       |
| `delete_project`            | `project`, `confirmName` matching the current project name. Registered only with `--allow-delete`                                                              |
| `create_git_project`        | `name`, `repoFullName` (owner/repo), `ref`; optional `rootDirectory`, `workspaceId`, `wait` (default true), `timeoutSec` (default/max 900)                     |
| `redeploy_git_project`      | `project`; redeploy the saved GitHub source. Optional `wait`, `timeoutSec`. Does not switch branches                                                           |
| `db_get_info`               | `project`; database metadata and asynchronous operation status (null when absent)                                                                              |
| `db_create`                 | `project`, optional `name`; create an empty database                                                                                                           |
| `db_delete`                 | `project`, `confirmName` matching the database name; only with `--allow-delete`                                                                                |
| `db_list_tokens`            | `project`; database connection token metadata                                                                                                                  |
| `db_create_token`           | `project`; optional `name`, `permission` (default read_write), `ttlSeconds` (default 2592000). Plaintext only at issuance                                      |
| `db_revoke_token`           | `project`, `tokenId`; revoke a database connection token                                                                                                       |
| `db_create_export`          | `project`, optional `idempotencyKey`; start an export                                                                                                          |
| `db_get_export`             | `project`, `exportJobId`; read export job status                                                                                                               |
| `db_get_export_download`    | `project`, `exportJobId`; issue a signed download URL for a ready job                                                                                          |
| `db_import`                 | `project`, `file` (absolute path on the MCP server), optional `name`; upload SQLite parts and start import                                                     |
| `list_api_tokens`           | Optional `limit` (1–100), `until`, `since` (epoch ms); metadata only                                                                                           |
| `create_api_token`          | Only on an explicit user request. `name`, `scopeType`; optional `workspaceId`, `expiresAt` (epoch ms / null). Only the issued `bearerToken` bypasses redaction |
| `revoke_api_token`          | `tokenId` (may be current). Revoking current breaks subsequent authentication                                                                                  |
| `storage_list_buckets`      | Optional `workspaceId`, `cursor`; list buckets and return `apiOrigin`                                                                                          |
| `storage_create_bucket`     | `name`, `visibility`; optional `workspaceId`                                                                                                                   |
| `storage_delete_bucket`     | `bucket`, `confirmName` matching the bucket name; optional `workspaceId`. Only with `--allow-delete`                                                           |
| `storage_list_access_keys`  | `bucket`; optional `workspaceId`, `cursor`                                                                                                                     |
| `storage_create_access_key` | `bucket`, `permission`; optional `workspaceId`. Return the full key and API origin at issuance                                                                 |
| `storage_revoke_access_key` | `bucket`, `keyId`; optional `workspaceId`                                                                                                                      |
| `storage_list_files`        | `bucket`; optional `workspaceId`, `cursor`                                                                                                                     |
| `storage_get_file_url`      | `bucket`, `fileId`; optional `workspaceId`                                                                                                                     |
| `storage_upload_file`       | `bucket`, `path` (local absolute path); optional `name`, `contentType`, `workspaceId`. Upload using a temporary key                                            |
| `storage_delete_file`       | `bucket`, `fileId`, `confirmName` matching the file name; optional `workspaceId`. Only with `--allow-delete`                                                   |
| `storage_get_usage`         | Optional `workspaceId`; usage and limits                                                                                                                       |

Tool descriptions, parameter descriptions and the server instructions are written in English for the model, and every tool has an `outputSchema`. `envs` is an array of `{key, value, type?}`; type is `secret` (default) or `plain`. Add `--allow-delete` to the server arguments to enable deletion. `deploy_project` / `wait_deployment` send progress notifications when a progressToken is provided.

The server also provides the `hanamii://docs/public-api` resource and the `deploy_app` prompt for deployment guidance.

## For AI agents

Use CLI `--json` for machine-readable results. API tokens are masked in normal output and errors. CLI `tokens create` and MCP `create_api_token` return only the newly issued `bearerToken` as an exception; metadata remains redacted. Storage keys and database connection tokens also return plaintext only at issuance. Never copy secrets or signed URLs into logs, source code or unrelated responses.

## Working with databases and storage

```bash
hanamii db create --project my-app --name app-db
hanamii db info --project my-app
hanamii db export --project my-app --output backup.db
hanamii db import backup.db --project empty-app --name restored
hanamii storage buckets list --workspace <id>
hanamii storage files list uploads --workspace <id>
```

Database creation, deletion and import are asynchronous. Call `db info` / `db_get_info` repeatedly until ready, failed, or null after deletion. Import requires a project without a database; it never automatically deletes or overwrites one. SQLite files must be at most 100 MiB. MCP `file` is an absolute path readable by the server process. Failed part uploads or missing ETags prevent import from starting.

For exports, call `db_create_export`, poll `db_get_export` until ready, then call `db_get_export_download`. Signed URL expiry differs from artifact retention; URLs can be reissued within the retention period. The CLI waits by default; `--no-wait` returns the job and `--job <id>` resumes it. `--output` verifies size and SHA-256 and saves with mode 0600 without overwriting an existing file. `--output` cannot be combined with `--no-wait`; `--job` cannot be combined with `--idempotency-key`.

Storage `<bucket>` / `bucket` accepts an ID or name. An omitted workspace uses the token scope or the single accessible workspace; ambiguous workspaces require an explicit ID. Pass `nextCursor` as `--cursor` / `cursor` for more results. The free plan allows private buckets only, and visibility cannot change after creation. Bucket deletion reports processing when accepted or completed when finished.

Database information requires project view permission; other database operations require owner/admin. Storage listings, view URLs and usage are available to members; bucket creation/deletion, key operations, and file uploads/deletion require owner/admin. The four MCP data deletion tools (project, bucket, database and file) require `--allow-delete` and the target's current name in `confirmName`. There are 36 tools by default, or 40 with deletion enabled.

File operations issue a temporary read_write key using the API token and always attempt revocation afterwards. Its plaintext is never returned. Revocation failures appear in successful results as `warnings`, or alongside the operation error on failure, including the key ID. Revoke it with `hanamii storage keys revoke <bucket> <keyId> --workspace <id>`.

Uploads compute MD5 as a stream and preserve the signed headers and Content-Length during PUT. Unknown extensions use `application/octet-stream`; override with `--content-type` / `contentType`. Completion retries HTTP 409 up to 10 attempts at 3-second intervals (each API request has a 60-second limit, PUT has 15 minutes). Other failures cancel the upload; cancellation failures also produce warnings with fileId. Completion timeout preserves the upload and includes fileId in the error. Retry complete for that same fileId through the file API instead of re-uploading. There is no standalone complete command in this CLI/MCP.

## Limitations

- Environment variables can only be added or updated. There is no deletion API or `env unset`.
- Database lifecycle, connection tokens, exports and imports are supported. Row writes and raw SQL are not provided.
- Logs are runtime logs. Following uses polling, not streaming.
- Storage uploads require nonempty regular files up to 2 GB (2,000,000,000 bytes). The server also enforces plan limits. Existing names are never overwritten automatically.
- GitHub connection setup and repository/branch listings are not implemented. Git redeployment uses the saved branch.
- MCP supports local stdio only.
- Phase 7 additions were verified with mocks; production write checks have not been run.

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
