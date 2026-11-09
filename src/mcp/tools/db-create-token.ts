import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import { databaseToken, databaseTokenInput } from '../database-schemas.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_create_token',
    {
      description:
        'Issue a connection token for the attached database. Use it only when the user explicitly requests database credentials. Requires owner or admin permission. The plaintext token is returned only at issuance; keep it out of logs and source code. Returns authToken metadata, token and databaseUrl. Default permission is read_write and lifetime is 30 days. Example: {"project":"my-app","permission":"read_only"}',
      inputSchema: { project: projectParam, ...databaseTokenInput },
      outputSchema: {
        authToken: databaseToken.nullable(),
        token: z.string(),
        databaseUrl: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const input = {
          ...(args.name === undefined ? {} : { name: args.name }),
          ...(args.permission === undefined ? {} : { permission: args.permission }),
          ...(args.ttlSeconds === undefined ? {} : { ttlSeconds: args.ttlSeconds }),
        }
        const result = await client.createDatabaseToken(id, input, { retryRateLimit: false })
        requiredValue(result.token, '発行した DB 接続トークン')
        requiredValue(result.databaseUrl, 'DB 接続 URL')
        return format(result, token)
      }),
  )
}
