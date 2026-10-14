import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createClient, type HanamiiClient } from '../api/client.js'
import { AuthError } from '../api/errors.js'
import type { ConfigOptions } from '../config/paths.js'
import { resolveConfig } from '../config/resolve.js'
import { format } from './format.js'

export interface ServerOptions extends ConfigOptions {
  token?: string
  fetch?: typeof globalThis.fetch
  allowDelete?: boolean
}
export type Extra = Parameters<ToolCallback<Record<string, never>>>[1]
export function createToolContext(options: ServerOptions) {
  return {
    async run(action: (client: HanamiiClient, token: string) => Promise<CallToolResult>) {
      let token: string | undefined
      try {
        const config = await resolveConfig(options)
        token = config.token
        if (!token) throw new AuthError()
        return await action(
          createClient({
            token,
            baseUrl: config.baseUrl,
            ...(options.fetch ? { fetch: options.fetch } : {}),
          }),
          token,
        )
      } catch (error) {
        return format(
          { error: { message: error instanceof Error ? error.message : '処理に失敗しました' } },
          token,
          true,
        )
      }
    },
  }
}
export type ToolContext = ReturnType<typeof createToolContext>
export const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
