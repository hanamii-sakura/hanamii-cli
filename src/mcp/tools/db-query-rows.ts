import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { projectParam, rowsOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_query_rows',
    {
      description:
        'Read rows from one table of the project\'s database (beta). Read-only: SQL and WHERE filters are not supported. Use it to inspect stored data; always call db_list_tables first to get the table name. Do not use it to change data. Requires a token with owner or admin role. limit is 1-100 (default 50) and offset is 0 or more; increase offset by limit to read the next page. Returns table, rows[] (objects keyed by column name) and pagination{limit, offset, totalCount}. Example: {"project": "my-app", "table": "users", "limit": 20, "offset": 0}',
      inputSchema: {
        project: projectParam,
        table: z.string().min(1).describe('Table name as listed by db_list_tables, e.g. "users"'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe('Maximum number of rows to return, 1-100 (default 50)'),
        offset: z
          .number()
          .int()
          .min(0)
          .max(1000000)
          .default(0)
          .describe('Number of rows to skip. Use offset + limit for the next page. Default 0'),
      },
      outputSchema: rowsOut,
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
