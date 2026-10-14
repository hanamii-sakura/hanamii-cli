import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'list_workspaces',
    { description: 'ワークスペース一覧', inputSchema: {}, annotations: readOnly },
    (_args) => context.run(async (client, token) => format(await client.listWorkspaces(), token)),
  )
}
