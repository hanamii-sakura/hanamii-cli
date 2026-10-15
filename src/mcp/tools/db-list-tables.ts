import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { projectParam, tablesOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_list_tables',
    {
      description:
        'List the tables and column definitions of the project\'s attached database (beta). Read-only. Use it before db_query_rows to learn which tables and columns exist. Returns a not_found error when the project has no database. Do not use it to change data: creating tables, writing rows and running SQL are not possible through this server. Requires a token with owner or admin role in the workspace. Returns tables[]{name, columns[]{name, type, isPrimaryKey, isNotNull}}. Example: {"project": "my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: tablesOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.listDatabaseTables(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
