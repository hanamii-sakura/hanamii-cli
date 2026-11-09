import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { databaseOut, databaseNameParam } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_create',
    {
      description:
        'Create an empty database attached to a project that has no database. Use it when the user needs persistent SQLite compatible storage. Requires owner or admin permission. Creation is asynchronous; call db_get_info until ready or failed. Returns database metadata with its current status. Example: {"project":"my-app","name":"app-db"}',
      inputSchema: { project: projectParam, name: databaseNameParam },
      outputSchema: databaseOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.createDatabase(
          id,
          args.name === undefined ? {} : { name: args.name },
          { retryRateLimit: false },
        )
        requiredValue(result.database, '作成後のデータベース')
        return format(result, token)
      }),
  )
}
