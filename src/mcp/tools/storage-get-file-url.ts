import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketParam, storageFileUrlOut, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_get_file_url',
    {
      description:
        'Issue a URL that opens one file of an object storage bucket (beta). Use it to view or download a file found with storage_list_files. For a private bucket the URL works for one hour and anyone holding it can open the file, so do not publish it or store it; for a public bucket it is the permanent public URL. Do not use it to upload a file. Any workspace member can call it. Returns url and expiresAt (null for a public bucket). Example: {"bucket": "app-uploads", "fileId": "file_123"}',
      inputSchema: {
        workspaceId: workspaceParam,
        bucket: bucketParam,
        fileId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,128}$/)
          .describe('File ID as listed by storage_list_files in the id field'),
      },
      outputSchema: storageFileUrlOut,
      // 呼ぶたびに新しい URL を発行するが、保存データは変えない
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket } = await resolveBucket(client, workspaceId, args.bucket)
        return format(
          await client.createStorageFileViewUrl(workspaceId, bucket.id, args.fileId),
          token,
        )
      }),
  )
}
