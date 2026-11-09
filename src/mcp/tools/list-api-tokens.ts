import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { tokenListOut } from '../token-schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'list_api_tokens',
    {
      description:
        'List metadata for the API tokens owned by the authenticated user. Use it to inspect scopes and expiration dates or find an ID before revoking a token. Plaintext bearer tokens are never returned here. Returns tokens and pagination with epoch millisecond next and prev cursors. Pass next as until to read another page. Example: {"limit":20}',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of tokens per page, from 1 to 100; server default is 20'),
        until: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Epoch millisecond next cursor from the previous page'),
        since: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Epoch millisecond lower bound for token creation time'),
      },
      outputSchema: tokenListOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.listTokens({
            ...(args.limit === undefined ? {} : { limit: args.limit }),
            ...(args.until === undefined ? {} : { until: args.until }),
            ...(args.since === undefined ? {} : { since: args.since }),
          }),
          token,
        ),
      ),
  )
}
