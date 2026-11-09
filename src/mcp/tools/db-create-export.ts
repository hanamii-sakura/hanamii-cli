import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import { exportOut } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_create_export',
    {
      description:
        'Start an asynchronous SQLite database export. Use it to back up the database before a migration or deletion. Requires owner or admin permission. Reuse idempotencyKey to retrieve the same job when retrying. Poll db_get_export until ready, then call db_get_export_download. Returns exportJob metadata and current status. Example: {"project":"my-app","idempotencyKey":"backup-2026-11-09"}',
      inputSchema: {
        project: projectParam,
        idempotencyKey: z
          .string()
          .min(1)
          .optional()
          .describe('Stable request key reused to prevent duplicate export jobs'),
      },
      outputSchema: exportOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.createDatabaseExport(
          id,
          args.idempotencyKey === undefined ? {} : { idempotencyKey: args.idempotencyKey },
          { retryRateLimit: false },
        )
        requiredValue(result.exportJob, 'エクスポートジョブ')
        return format(result, token)
      }),
  )
}
