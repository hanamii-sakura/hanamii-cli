import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'restart_project',
    {
      description: '保存済み設定を反映。変更がない場合は noop',
      inputSchema: { project: z.string().min(1) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.restartProject(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
