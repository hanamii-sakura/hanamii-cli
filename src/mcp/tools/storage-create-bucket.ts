import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace } from '../../core/storage.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { bucketCreatedOut, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'storage_create_bucket',
    {
      description:
        'Create an object storage bucket in a workspace (beta). Use it when an app needs to store or serve files such as images; afterwards call storage_create_access_key to get a key for the app. visibility cannot be changed after creation: "public" serves files at a permanent URL anyone can open, "private" serves them only through expiring URLs. The free plan allows one private bucket; public buckets need a paid plan. Requires a token with owner or admin role. Returns workspaceId, id, name, visibility and createdAt. Example: {"name": "app-uploads", "visibility": "private"}',
      inputSchema: {
        workspaceId: workspaceParam,
        name: z
          .string()
          .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/)
          .describe(
            'Bucket name: 3-63 lowercase letters, digits or hyphens, starting and ending with a letter or digit. Unique within the workspace',
          ),
        visibility: z
          .enum(['public', 'private'])
          .describe('"private" (expiring URLs only) or "public" (permanent open URLs)'),
      },
      outputSchema: bucketCreatedOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const workspaceId = await requireWorkspace(client, args.workspaceId)
        return format(
          {
            workspaceId,
            ...(await client.createStorageBucket(workspaceId, {
              name: args.name,
              visibility: args.visibility,
            })),
          },
          token,
        )
      }),
  )
}
