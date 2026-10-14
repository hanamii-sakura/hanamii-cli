import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { envSchema } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'set_env',
    {
      description: '環境変数を保存。restart=true で反映（削除 API はありません）',
      inputSchema: {
        project: z.string().min(1),
        envs: z.array(envSchema).min(1),
        restart: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.setEnv(id, args.envs)
        return format(
          {
            envs: result.envs.map(({ key, type }) => ({ key, type })),
            ...(args.restart ? { restart: await client.restartProject(id) } : {}),
          },
          token,
        )
      }),
  )
}
