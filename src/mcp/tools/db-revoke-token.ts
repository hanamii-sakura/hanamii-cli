import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_revoke_token',
    {
      description:
        'Revoke a database connection token by its ID. Use it when credentials are no longer needed or after issuing and deploying a replacement. Apps using this token lose database access, so check the target with db_list_tokens first. Requires owner or admin permission. Returns authToken with id and revoked status. Example: {"project":"my-app","tokenId":"dbtok_123"}',
      inputSchema: {
        project: projectParam,
        tokenId: z.string().min(1).describe('Database token ID returned by db_list_tokens'),
      },
      outputSchema: { authToken: z.object({ id: z.string(), status: z.literal('revoked') }) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.revokeDatabaseToken(id, args.tokenId)
        return format(result, token)
      }),
  )
}
