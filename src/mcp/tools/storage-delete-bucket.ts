import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketDeletedOut, bucketParam, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_delete_bucket',
    {
      description:
        'Permanently delete an object storage bucket together with its files and access keys (beta). This cannot be undone from the dashboard or this server. Use it only when the user explicitly asked to delete this bucket, and call storage_list_buckets first to confirm the target. confirmName must equal the current bucket name exactly; otherwise nothing is deleted. Public and shared URLs keep working for several minutes after the call. Requires a token with owner or admin role. Returns bucketId, name and status (completed, or processing while URLs are still being shut down). Example: {"bucket": "app-uploads", "confirmName": "app-uploads"}',
      inputSchema: {
        workspaceId: workspaceParam,
        bucket: bucketParam,
        confirmName: z
          .string()
          .min(1)
          .describe(
            'The current bucket name, typed exactly as storage_list_buckets returns it, to confirm the deletion',
          ),
      },
      outputSchema: bucketDeletedOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket } = await resolveBucket(client, workspaceId, args.bucket)
        if (args.confirmName !== bucket.name)
          throw new Error('confirmName がバケット名と一致しません')
        const result = await client.deleteStorageBucket(workspaceId, bucket.id)
        return format(
          { bucketId: bucket.id, name: bucket.name, status: result.status ?? 'completed' },
          token,
        )
      }),
  )
}
