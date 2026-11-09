import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'revoke_api_token',
    {
      description:
        'Revoke an API token owned by the authenticated user. Use it when the user asks to remove a credential or after installing a replacement during rotation. Call list_api_tokens first to identify the correct token. Revoking current invalidates this server authentication and later calls will fail until configured with another token. Returns token with id and deleted=true. Example: {"tokenId":"tok_123"}',
      inputSchema: {
        tokenId: z
          .string()
          .min(1)
          .describe('Token ID from list_api_tokens, or current to revoke this server credential'),
      },
      outputSchema: { token: z.object({ id: z.string(), deleted: z.literal(true) }) },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => format(await client.revokeToken(args.tokenId), token)),
  )
}
