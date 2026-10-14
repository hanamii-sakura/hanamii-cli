import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_env',
    {
      description: '環境変数を取得。既定は key/type のみ。値が必要な場合だけ decrypt=true',
      inputSchema: { project: z.string().min(1), decrypt: z.boolean().default(false) },
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const { envs } = await client.getEnv(
          await resolveProject(client, { project: args.project }),
          { decrypt: args.decrypt },
        )
        return format(
          {
            envs: envs.map(({ key, type, value }) => ({
              key,
              type,
              ...(args.decrypt && value !== undefined ? { value } : {}),
            })),
          },
          token,
        )
      }),
  )
}
