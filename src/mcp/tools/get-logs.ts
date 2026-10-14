import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { fetchLogs } from '../../core/logs.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_logs',
    {
      description: 'ランタイムログを取得',
      inputSchema: {
        project: z.string().min(1),
        since: z.string().default('-15m'),
        limit: z.number().int().min(1).max(500).default(100),
        before: z.string().optional(),
      },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const result = await fetchLogs(
          client,
          await resolveProject(client, { project: args.project }),
          {
            since: args.since,
            limit: args.limit,
            ...(args.before === undefined ? {} : { before: args.before }),
          },
        )
        return format(
          result,
          token,
          false,
          result.logs.map((log) => `${log.timestamp} ${log.message}`).join('\n'),
        )
      }),
  )
}
