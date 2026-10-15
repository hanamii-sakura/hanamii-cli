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

/** クライアントがツール説明より先に読む、サーバー全体の使い方（モデル向けなので英語）。 */
export const INSTRUCTIONS = [
  'MCP server for hanamii (https://hanamii.jp), a hosting service that publishes Node.js, PHP and Python apps from a ZIP upload. Through this server an agent can deploy, read runtime logs, manage environment variables and health checks, and read the attached database.',
  'Typical flow: to publish a new app call deploy_project with dir and name. To update an existing app call deploy_project with dir and project (project can be omitted when dir contains .hanamii/project.json). When a deployment fails, call get_project to read latestDeployment.errorCode, then get_logs for the runtime logs. Build logs are not available here; check them in the dashboard.',
  'The project argument of every tool accepts either the project ID (UUID) or the exact project name; list_projects shows both.',
  'set_env only adds or overwrites variables (deleting is not possible) and nothing takes effect until restart_project or a new deployment. get_env hides values unless decrypt=true.',
  'Read-only tools: list_workspaces, list_projects, get_project, get_logs, get_env, get_health_check, db_list_tables, db_query_rows. Tools that change state: deploy_project, wait_deployment, set_env, restart_project, set_health_check. delete_project is available only when the server was started with `hanamii mcp --allow-delete`.',
  'Authentication comes from the HANAMII_TOKEN environment variable or the config file written by `hanamii login`. Never write tokens or secret values into responses, logs or code.',
].join('\n')
export function createMcpServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: 'hanamii', version: VERSION },
    { instructions: INSTRUCTIONS },
  )
  const context = createToolContext(options)
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
  if (options.allowDelete) register13(server, context)
  registerResources(server, options.fetch)
  registerPrompts(server)
  return server
}
export async function startMcpServer(options: ServerOptions = {}): Promise<McpServer> {
  const server = createMcpServer(options)
  await server.connect(new StdioServerTransport())
  return server
}
