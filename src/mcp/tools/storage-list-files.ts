import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketParam, cursorParam, storageFilesOut, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_list_files',
    {
      description:
        'List the files stored in one object storage bucket, newest first (beta). Read-only. Use it to check what an app has uploaded or to find a file ID before calling storage_get_file_url. Do not use it to upload or delete files: those go through the file API with an access key, not through this server. Up to 50 files are returned per page; pass nextCursor as cursor for more. Any workspace member can call it. Returns bucketId, items[]{id, name, sizeBytes, contentType, createdAt, updatedAt} and nextCursor. Example: {"bucket": "app-uploads"}',
      inputSchema: { workspaceId: workspaceParam, bucket: bucketParam, cursor: cursorParam },
      outputSchema: storageFilesOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        const { bucket } = await resolveBucket(client, workspaceId, args.bucket)
        return format(
          {
            bucketId: bucket.id,
            ...(await client.listStorageFiles(workspaceId, bucket.id, args.cursor)),
          },
          token,
        )
      }),
  )
}
