import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { requireWorkspace } from '../../core/storage.js'
import { requiredValue } from '../../core/database.js'
import type { ToolContext } from '../context.js'
import { formatCreatedToken } from '../format.js'
import { tokenMetadata } from '../token-schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'create_api_token',
    {
      description:
        'Issue an API token only when the user explicitly asks for a new API token. Use it for an authorized integration or credential rotation, never automatically to work around permission errors. Choose the narrowest scope the user requested. Returns token metadata and bearerToken; the plaintext bearerToken is available only in this issuance response. Do not put it in logs, source code or unrelated responses. Example: {"name":"CI","scopeType":"workspace","workspaceId":"ws_1"}',
      inputSchema: {
        name: z.string().trim().min(1).describe('Display name for the newly issued API token'),
        scopeType: z
          .enum(['full_account', 'workspace'])
          .describe('Requested access scope: full account or a single workspace'),
        workspaceId: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Target workspace ID for workspace scope; omitted resolves a single accessible workspace',
          ),
        expiresAt: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe('Future expiry in epoch milliseconds; null or omitted means no expiration'),
      },
      outputSchema: { token: tokenMetadata, bearerToken: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        if (args.scopeType === 'full_account' && args.workspaceId)
          throw new Error('full_account には workspaceId を指定できません')
        if (args.expiresAt != null && args.expiresAt <= Date.now())
          throw new Error('expiresAt は未来の日時を指定してください')
        const workspaceId =
          args.scopeType === 'workspace'
            ? await requireWorkspace(client, args.workspaceId)
            : undefined
        const result = await client.createToken(
          {
            name: args.name,
            scopeType: args.scopeType,
            ...(workspaceId ? { scopeWorkspaceId: workspaceId } : {}),
            ...(args.expiresAt === undefined ? {} : { expiresAt: args.expiresAt }),
          },
          { retryRateLimit: false },
        )
        return formatCreatedToken(
          { token: result.token },
          requiredValue(result.bearerToken, '発行した API トークン'),
          token,
        )
      }),
  )
}
