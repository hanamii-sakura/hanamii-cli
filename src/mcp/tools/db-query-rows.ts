import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_query_rows',
    {
      description: 'DB 行取得（読取専用、SQL 不可）',
      inputSchema: {
        project: z.string().min(1),
        table: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(1000000).default(0),
      },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.getDatabaseRows(
            await resolveProject(client, { project: args.project }),
            args.table,
            { limit: args.limit, offset: args.offset },
          ),
          token,
        ),
      ),
  )
}
