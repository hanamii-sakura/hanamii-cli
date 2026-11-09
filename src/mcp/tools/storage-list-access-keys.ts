import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { accessKeysOut, bucketParam, cursorParam, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_list_access_keys',
    {
      description:
        'List the active access keys of one object storage bucket (beta). Read-only: only metadata is returned, never the secret key itself. Use it to check which keys exist and when they were last used before revoking or rotating one. Do not use it to recover a lost key; issue a new one with storage_create_access_key instead. Requires a token with owner or admin role. Returns bucketId, items[]{keyId, permission: read_only|read_write, creatorEmail, createdAt, lastUsedAt} and nextCursor. Example: {"bucket": "app-uploads"}',
      inputSchema: { workspaceId: workspaceParam, bucket: bucketParam, cursor: cursorParam },
      outputSchema: accessKeysOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket } = await resolveBucket(client, workspaceId, args.bucket)
        return format(
          {
            bucketId: bucket.id,
            ...(await client.listStorageAccessKeys(workspaceId, bucket.id, args.cursor)),
          },
          token,
        )
      }),
  )
}
