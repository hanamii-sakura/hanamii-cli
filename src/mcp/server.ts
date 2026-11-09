import { register as registerApiToken0 } from './tools/list-api-tokens.js'
import { register as registerApiToken1 } from './tools/create-api-token.js'
import { register as registerApiToken2 } from './tools/revoke-api-token.js'
import { register as registerCreateGit } from './tools/create-git-project.js'
import { register as registerRedeployGit } from './tools/redeploy-git-project.js'
import { register as registerDb0 } from './tools/db-get-info.js'
import { register as registerDb1 } from './tools/db-create.js'
import { register as registerDb2 } from './tools/db-delete.js'
import { register as registerDb3 } from './tools/db-list-tokens.js'
import { register as registerDb4 } from './tools/db-create-token.js'
import { register as registerDb5 } from './tools/db-revoke-token.js'
import { register as registerDb6 } from './tools/db-create-export.js'
import { register as registerDb7 } from './tools/db-get-export.js'
import { register as registerDb8 } from './tools/db-get-export-download.js'
import { register as registerDb9 } from './tools/db-import.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { register as register8 } from './tools/deploy-project.js'
import { register as register9 } from './tools/wait-deployment.js'
import { register as register10 } from './tools/set-env.js'
import { register as register11 } from './tools/restart-project.js'
import { register as register12 } from './tools/set-health-check.js'
import { register as register13 } from './tools/delete-project.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { VERSION } from '../version.js'
import { createToolContext, type ServerOptions } from './context.js'
import { register as register0 } from './tools/list-workspaces.js'
import { register as register1 } from './tools/list-projects.js'
import { register as register2 } from './tools/get-project.js'
import { register as register3 } from './tools/get-logs.js'
import { register as register4 } from './tools/get-env.js'
import { register as register5 } from './tools/get-health-check.js'
import { register as register6 } from './tools/db-list-tables.js'
import { register as register7 } from './tools/db-query-rows.js'
import { register as registerStorageListBuckets } from './tools/storage-list-buckets.js'
import { register as registerStorageCreateBucket } from './tools/storage-create-bucket.js'
import { register as registerStorageDeleteBucket } from './tools/storage-delete-bucket.js'
import { register as registerStorageListAccessKeys } from './tools/storage-list-access-keys.js'
import { register as registerStorageCreateAccessKey } from './tools/storage-create-access-key.js'
import { register as registerStorageRevokeAccessKey } from './tools/storage-revoke-access-key.js'
import { register as registerStorageListFiles } from './tools/storage-list-files.js'
import { register as registerStorageGetFileUrl } from './tools/storage-get-file-url.js'
import { register as registerStorageGetUsage } from './tools/storage-get-usage.js'

/** クライアントがツール説明より先に読む、サーバー全体の使い方（モデル向けなので英語）。 */
export const INSTRUCTIONS = [
  'MCP server for hanamii (https://hanamii.jp), a hosting service for Node.js, PHP and Python apps. This local stdio server supports ZIP and GitHub deployment, runtime logs, environment variables, health checks, database management, object storage management and API token management. There are 35 tools by default and 38 when deletion is enabled.',
  'Typical ZIP flow: call deploy_project with dir and name to publish a new app, or dir and project to update an app. project can be omitted when dir contains .hanamii/project.json. wait_deployment waits for completion. If deployment fails, use get_project and get_logs. Build logs are not available here; check the dashboard.',
  'GitHub flow: create_git_project requires name, repoFullName (owner/repo) and ref, plus optional workspaceId and rootDirectory. GitHub access must already be configured in the dashboard. redeploy_git_project uses the saved GitHub repository and branch; it cannot switch branches. Both tools default to waiting and do not modify local files or project links.',
  'Use list_workspaces and list_projects to identify targets. Project arguments accept an ID (UUID) or exact name. Storage bucket arguments accept an ID or exact name. Ambiguous workspaces must be specified explicitly.',
  'get_env hides values unless decrypt=true. set_env adds or overwrites variables and requires restart_project or a new deployment to take effect; variable deletion is unavailable. get_health_check and set_health_check manage health check configuration.',
  'Database flow: db_get_info returns database metadata or null and advances asynchronous lifecycle operations. db_create creates an empty database. db_import uploads a local SQLite file (absolute path on this server, at most 100 MiB) and creates a database only on a project without one. Neither automatically deletes an existing database. After create, import or delete, poll db_get_info until ready, failed or null after deletion. db_list_tables and db_query_rows inspect data; SQL and row writes are unavailable.',
  'db_list_tokens lists database credential metadata; db_create_token issues a connection token and databaseUrl; db_revoke_token revokes a connection token. Database information requires project view permission, while other database operations require owner/admin permission. Use db_create_export to start a backup, db_get_export to poll until ready, and db_get_export_download to issue a temporary URL. Reuse idempotencyKey when retrying an export. The URL can be reissued before artifact retention expires. Missing required API response values produce explicit errors.',
  'Object storage (beta) is per workspace. storage_list_buckets lists buckets and apiOrigin; storage_create_bucket creates one. storage_list_access_keys, storage_create_access_key and storage_revoke_access_key manage keys. Apps upload and delete files through the file API at apiOrigin with a key; this server does not perform those file operations. storage_list_files lists metadata, storage_get_file_url issues a view URL, and storage_get_usage reports usage. Pass nextCursor as cursor for more pages. Visibility is immutable; private view URLs expire after one hour. Bucket creation/deletion and key operations require owner/admin.',
  'list_api_tokens returns token metadata with pagination (pass next as until). Use create_api_token only when the user explicitly requests a new API token, never to bypass authorization errors. Choose the requested scope and expiry. revoke_api_token invalidates a token; revoking current breaks subsequent authentication until a replacement is configured.',
  'Data deletion tools delete_project, storage_delete_bucket and db_delete are registered only with hanamii mcp --allow-delete. Use them only on an explicit deletion request and supply confirmName matching the current project, bucket or database name respectively. Revoking keys or tokens does not require this flag but interrupts clients using the credential.',
  'Authentication uses HANAMII_TOKEN or the config written by hanamii login. Keep authentication tokens and secret values out of logs, source code and unrelated responses. Issuance tools return the newly issued credential only in that response: create_api_token exposes only its bearerToken as a redaction exception, while its metadata stays redacted. Database connection tokens and storage keys are also returned only at issuance. Treat signed URLs as sensitive. All other API token output remains redacted.',
].join('\n')
export function createMcpServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'hanamii', version: VERSION },
    { instructions: INSTRUCTIONS },
  )
  const context = createToolContext(options)
  registerCreateGit(server, context)
  registerRedeployGit(server, context)
  registerApiToken0(server, context)
  registerApiToken1(server, context)
  registerApiToken2(server, context)
  register0(server, context)
  register1(server, context)
  register2(server, context)
  register3(server, context)
  register4(server, context)
  register5(server, context)
  register6(server, context)
  register7(server, context)
  register8(server, context)
  register9(server, context)
  register10(server, context)
  register11(server, context)
  register12(server, context)
  registerStorageListBuckets(server, context)
  registerStorageCreateBucket(server, context)
  registerStorageListAccessKeys(server, context)
  registerStorageCreateAccessKey(server, context)
  registerStorageRevokeAccessKey(server, context)
  registerStorageListFiles(server, context)
  registerStorageGetFileUrl(server, context)
  registerStorageGetUsage(server, context)
  registerDb0(server, context)
  registerDb1(server, context)
  registerDb3(server, context)
  registerDb4(server, context)
  registerDb5(server, context)
  registerDb6(server, context)
  registerDb7(server, context)
  registerDb8(server, context)
  registerDb9(server, context)
  if (options.allowDelete) {
    registerDb2(server, context)
    register13(server, context)
    registerStorageDeleteBucket(server, context)
  }
  registerResources(server, options.fetch)
  registerPrompts(server)
  return server
}
export async function startMcpServer(options: ServerOptions = {}): Promise<McpServer> {
  const server = createMcpServer(options)
  await server.connect(new StdioServerTransport())
  return server
}
