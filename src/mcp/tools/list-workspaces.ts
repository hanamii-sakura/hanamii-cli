import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { workspacesOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'list_workspaces',
    {
      description:
        'List the hanamii workspaces this token can access. Use it when the account has several workspaces and you need a workspaceId for deploy_project or list_projects. If there is only one workspace you can skip this tool: workspaceId is chosen automatically when omitted. Takes no arguments and requires only a valid token. Returns workspaces[] with id (UUID), name and role such as "owner". Example: {}',
      inputSchema: {},
      outputSchema: workspacesOut,
      annotations: readOnly,
    },
    (_args) => context.run(async (client, token) => format(await client.listWorkspaces(), token)),
  )
}
