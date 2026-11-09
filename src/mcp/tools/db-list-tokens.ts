import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import { databaseToken } from '../database-schemas.js'
import { readOnly, type ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_list_tokens',
    {
      description:
        'List metadata for the attached database connection tokens. Use it before rotating or revoking a token to identify its ID, permission and expiration. Requires owner or admin permission. Plaintext token values are never included in this list. Returns authTokens with status and epoch millisecond timestamps. Example: {"project":"my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: { authTokens: z.array(databaseToken) },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.listDatabaseTokens(id)
        return format(result, token)
      }),
  )
}
