import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { deleteStorageFile } from '../../core/storage-files.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketParam, workspaceParam } from '../schemas.js'
import { storageFileOperationOut } from '../storage-file-schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_delete_file',
    {
      description:
        'Delete a file from an object storage bucket. Use it only when the user explicitly requests deletion. Requires owner or admin permission and startup with --allow-delete. The file name is looked up through all list pages and must match confirmName before issuing a temporary read_write key. The key is revoked afterwards. Returns fileId, name, deleted and warnings; failed key revocation includes keyId. Public caches may serve the file for up to ten minutes. Example: {"bucket":"uploads","fileId":"file_123","confirmName":"photo.png"}',
      inputSchema: {
        bucket: bucketParam,
        workspaceId: workspaceParam,
        fileId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,128}$/)
          .describe('File ID from storage_list_files, not its name'),
        confirmName: z
          .string()
          .min(1)
          .describe('Exact current file name from storage_list_files to confirm deletion'),
      },
      outputSchema: { ...storageFileOperationOut, deleted: z.literal(true) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await deleteStorageFile(client, {
            bucket: args.bucket,
            fileId: args.fileId,
            ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
            confirm: async (name) => name === args.confirmName,
          }),
          token,
        ),
      ),
  )
}
