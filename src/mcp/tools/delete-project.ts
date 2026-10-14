import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'delete_project',
    {
      description: 'プロジェクトを削除。confirmName は現在のプロジェクト名との完全一致が必要',
      inputSchema: { project: z.string().min(1), confirmName: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const { project } = await client.getProject(id)
        if (args.confirmName !== project.name)
          throw new Error('confirmName がプロジェクト名と一致しません')
        return format(await client.deleteProject(id), token)
      }),
  )
}
