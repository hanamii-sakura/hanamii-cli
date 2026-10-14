import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_project',
    {
      description: 'プロジェクト詳細',
      inputSchema: { project: z.string().min(1) },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.getProject(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
