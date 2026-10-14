import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'list_projects',
    {
      description: 'プロジェクト一覧',
      inputSchema: {
        workspaceId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.listProjects({
            ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
          }),
          token,
        ),
      ),
  )
}
