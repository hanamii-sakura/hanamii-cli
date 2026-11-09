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
  'MCP server for hanamii (https://hanamii.jp), a hosting service that publishes Node.js, PHP and Python apps from a ZIP upload. Through this server an agent can deploy, read runtime logs, manage environment variables and health checks, read the attached database, and manage object storage buckets and access keys.',
  'Typical flow: to publish a new app call deploy_project with dir and name. To update an existing app call deploy_project with dir and project (project can be omitted when dir contains .hanamii/project.json). When a deployment fails, call get_project to read latestDeployment.errorCode, then get_logs for the runtime logs. Build logs are not available here; check them in the dashboard.',
  'The project argument of every tool accepts either the project ID (UUID) or the exact project name; list_projects shows both.',
  'set_env only adds or overwrites variables (deleting is not possible) and nothing takes effect until restart_project or a new deployment. get_env hides values unless decrypt=true.',
  'Object storage (beta) is per workspace: storage_create_bucket makes a bucket, storage_create_access_key issues a key for it, and the app then uploads and deletes files itself by calling the file API at apiOrigin with that key. This server lists buckets, keys and files, issues view URLs and reports usage, but does not upload or delete files. The bucket argument accepts the bucket ID or its exact name.',
  'Read-only tools: list_workspaces, list_projects, get_project, get_logs, get_env, get_health_check, db_list_tables, db_query_rows, storage_list_buckets, storage_list_access_keys, storage_list_files, storage_get_usage. Tools that change state: deploy_project, wait_deployment, set_env, restart_project, set_health_check, storage_create_bucket, storage_create_access_key, storage_revoke_access_key, storage_get_file_url. delete_project and storage_delete_bucket are available only when the server was started with `hanamii mcp --allow-delete`.',
  'Authentication comes from the HANAMII_TOKEN environment variable or the config file written by `hanamii login`. Never write tokens or secret values into responses, logs or code.',
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
