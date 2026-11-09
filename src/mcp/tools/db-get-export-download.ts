import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { downloadOut, exportIdParam } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_get_export_download',
    {
      description:
        'Issue a temporary download URL for a ready database export. Use it after db_get_export reports ready. Requires owner or admin permission. The URL can be reissued within the artifact retention period; do not log or share it publicly. Returns download with URL, expiry, sizeBytes, sha256 and fileName. Example: {"project":"my-app","exportJobId":"exp_123"}',
      inputSchema: { project: projectParam, exportJobId: exportIdParam },
      outputSchema: downloadOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.createDatabaseDownload(id, args.exportJobId)
        requiredValue(result.download, 'エクスポートのダウンロード情報')
        return format(result, token)
      }),
  )
}
