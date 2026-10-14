import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'set_health_check',
    {
      description: 'ヘルスチェック設定を保存。反映には restart またはデプロイが必要',
      inputSchema: {
        project: z.string().min(1),
        enabled: z.boolean(),
        path: z.string().startsWith('/').optional(),
        port: z.number().int().min(1).max(65535).nullable().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) =>
      context.run(async (client, token) => {
        if (args.enabled && !args.path) throw new Error('enabled=true には path が必要です')
        const body = args.enabled
          ? {
              enabled: true as const,
              path: args.path!,
              ...(args.port === undefined ? {} : { port: args.port }),
            }
          : { enabled: false as const }
        return format(
          await client.setHealthCheck(
            await resolveProject(client, { project: args.project }),
            body,
          ),
          token,
        )
      }),
  )
}
