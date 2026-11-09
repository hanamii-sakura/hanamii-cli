import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { accessKeyRevokedOut, bucketParam, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_revoke_access_key',
    {
      description:
        'Revoke one access key of an object storage bucket (beta). Use it when a key may have leaked or is no longer needed. Apps still using the key lose access immediately, so issue a replacement with storage_create_access_key and update the app first when rotating. Do not use it to stop URLs that were already issued: signed upload and private view URLs stay valid until they expire. Revoking an already revoked key succeeds. Requires a token with owner or admin role. Returns bucketId, keyId and revoked. Example: {"bucket": "app-uploads", "keyId": "key_AbCdEfGhIjKlMnOpQrStUvWx"}',
      inputSchema: {
        workspaceId: workspaceParam,
        bucket: bucketParam,
        keyId: z
          .string()
          .regex(/^key_[A-Za-z0-9_-]{24}$/)
          .describe('Key identifier from storage_list_access_keys, starting with "key_"'),
      },
      outputSchema: accessKeyRevokedOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket } = await resolveBucket(client, workspaceId, args.bucket)
        await client.revokeStorageAccessKey(workspaceId, bucket.id, args.keyId)
        return format({ bucketId: bucket.id, keyId: args.keyId, revoked: true }, token)
      }),
  )
}
