import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { isAbsolute } from 'node:path'
import { uploadStorageFile } from '../../core/storage-files.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketParam, workspaceParam } from '../schemas.js'
import { storageFileOperationOut } from '../storage-file-schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_upload_file',
    {
      description:
        'Upload a local file to an object storage bucket using a temporary read_write key, revoked afterwards. Use it when the user wants to store a file from this MCP server filesystem. Requires owner or admin permission. Files must be nonempty and at most 2 GB; existing names are never overwritten. Returns fileId, name, sizeBytes, contentType, uploaded and warnings. A completion timeout preserves fileId without cancellation; key revocation failures produce warnings with keyId. Example: {"bucket":"uploads","path":"/absolute/photo.png"}',
      inputSchema: {
        bucket: bucketParam,
        workspaceId: workspaceParam,
        path: z.string().min(1).describe('Absolute path to a local file on the MCP server'),
        name: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe('Stored file name; omitted means the local file basename'),
        contentType: z
          .string()
          .min(1)
          .max(255)
          .optional()
          .describe('MIME type; omitted means extension detection or application/octet-stream'),
      },
      outputSchema: {
        ...storageFileOperationOut,
        sizeBytes: z.string(),
        contentType: z.string(),
        uploaded: z.literal(true),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        if (!isAbsolute(args.path)) throw new Error('ファイルは絶対パスで指定してください')
        return format(
          await uploadStorageFile(client, {
            bucket: args.bucket,
            path: args.path,
            ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
            ...(args.name === undefined ? {} : { name: args.name }),
            ...(args.contentType === undefined ? {} : { contentType: args.contentType }),
          }),
          token,
        )
      }),
  )
}
