import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { requireWorkspace } from '../../core/storage.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketsOut, cursorParam, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_list_buckets',
    {
      description:
        'List the object storage buckets of a workspace (beta). Read-only. Use it to see which buckets exist, to look up a bucket ID by name, and to get apiOrigin, the base URL of the file API that apps call with an access key. Do not use it to list files; call storage_list_files for that. Any workspace member can call it. Returns workspaceId, items[]{id, name, visibility: public|private, createdAt}, nextCursor and apiOrigin. Example: {} or {"workspaceId": "<uuid>"}',
      inputSchema: { workspaceId: workspaceParam, cursor: cursorParam },
      outputSchema: bucketsOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        return format(
          { workspaceId, ...(await client.listStorageBuckets(workspaceId, args.cursor)) },
          token,
        )
      }),
  )
}
