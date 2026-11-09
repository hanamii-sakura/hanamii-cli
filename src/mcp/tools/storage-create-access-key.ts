import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { accessKeyIssuedOut, bucketParam, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_create_access_key',
    {
      description:
        'Issue an access key for one object storage bucket (beta). Use it when an app server needs to upload, list, download or delete files in the bucket through the file API at apiOrigin. The full key is returned only by this call and cannot be shown again, so store it right away, for example with set_env as HANAMII_STORAGE_KEY together with HANAMII_STORAGE_URL=apiOrigin. Do not write the key into source code, client-side code or chat text. A key works for this bucket only. Requires a token with owner or admin role. Returns bucketId, keyId, permission, createdAt, key and apiOrigin. Example: {"bucket": "app-uploads", "permission": "read_write"}',
      inputSchema: {
        workspaceId: workspaceParam,
        bucket: bucketParam,
        permission: z
          .enum(['read_only', 'read_write'])
          .describe(
            '"read_write" allows upload and delete as well; "read_only" allows list, download and share URLs only',
          ),
      },
      outputSchema: accessKeyIssuedOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket, apiOrigin } = await resolveBucket(client, workspaceId, args.bucket)
        const issued = await client.createStorageAccessKey(workspaceId, bucket.id, args.permission)
        return format({ bucketId: bucket.id, ...issued, apiOrigin }, token)
      }),
  )
}
