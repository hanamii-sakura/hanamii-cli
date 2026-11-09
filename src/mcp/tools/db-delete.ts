import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import { databaseOut } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_delete',
    {
      description:
        'Permanently delete the attached database and all of its data. Use it only when the user explicitly requests this deletion. Requires owner or admin permission and server startup with --allow-delete. confirmName must match the database name from db_get_info exactly. Returns database metadata while deleting, or null after deletion. Poll db_get_info for completion. Example: {"project":"my-app","confirmName":"app-db"}',
      inputSchema: {
        project: projectParam,
        confirmName: z
          .string()
          .describe(
            'Exact current database name from db_get_info, confirming permanent data deletion',
          ),
      },
      outputSchema: databaseOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const current = requiredValue(
          (await client.getDatabase(id)).database,
          '削除対象のデータベース',
        )
        if (args.confirmName !== current.name)
          throw new Error('confirmName がデータベース名と一致しません')
        const result = await client.deleteDatabase(id)
        return format(result, token)
      }),
  )
}
