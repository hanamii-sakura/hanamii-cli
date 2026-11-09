import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { exportOut, exportIdParam } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import { readOnly, type ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_get_export',
    {
      description:
        'Get the current state of a database export job. Use it after db_create_export until status becomes ready, failed, cancelled or expired. Requires owner or admin permission. A ready job can be downloaded with db_get_export_download before its retention deadline. Returns exportJob metadata, failureCode and artifact information. Example: {"project":"my-app","exportJobId":"exp_123"}',
      inputSchema: { project: projectParam, exportJobId: exportIdParam },
      outputSchema: exportOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.getDatabaseExport(id, args.exportJobId)
        requiredValue(result.exportJob, 'エクスポートジョブ')
        return format(result, token)
      }),
  )
}
