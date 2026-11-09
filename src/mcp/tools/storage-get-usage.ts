import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { requireWorkspace } from '../../core/storage.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { storageUsageOut, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_get_usage',
    {
      description:
        'Get the object storage usage of a workspace together with its plan limits (beta). Read-only. Use it to check remaining capacity before uploads, or to explain why an upload or bucket creation was rejected. All sizes and counts are decimal strings in bytes or items; limits are all "0" while the workspace is restricted and null when the plan is unknown. deliveredBytes is an estimate for the current month, not a limit. Any workspace member can call it. Returns workspaceId, usedBytes, fileCount, deliveredBytes and limits{maxBuckets, maxTotalBytes, maxFiles, maxFileBytes}. Example: {}',
      inputSchema: { workspaceId: workspaceParam },
      outputSchema: storageUsageOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        return format({ workspaceId, ...(await client.getStorageUsage(workspaceId)) }, token)
      }),
  )
}
