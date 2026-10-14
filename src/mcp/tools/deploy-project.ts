import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { deploy } from '../../core/deploy.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { progress } from '../progress.js'
import { envSchema } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'deploy_project',
    {
      description: 'ローカルディレクトリをデプロイ。wait=false は開始後に待機せず返却',
      inputSchema: {
        dir: z.string().min(1),
        name: z.string().min(1).optional(),
        project: z.string().min(1).optional(),
        workspaceId: z.string().optional(),
        envs: z.array(envSchema).optional(),
        wait: z.boolean().default(true),
        timeoutSec: z.number().int().min(1).max(900).default(900),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args, extra) =>
      context.run(async (client, token) => {
        const events = progress(extra, token)
        try {
          const result = await deploy(client, {
            dir: args.dir,
            wait: args.wait,
            timeoutMs: args.timeoutSec * 1000,
            ...(args.name === undefined ? {} : { name: args.name }),
            ...(args.project === undefined ? {} : { project: args.project }),
            ...(args.workspaceId === undefined ? {} : { workspaceId: args.workspaceId }),
            ...(args.envs === undefined ? {} : { envs: args.envs }),
            signal: extra.signal,
            onEvent: events.notify,
          })
          return format(result, token, result.exitCode !== 0)
        } finally {
          await events.flush()
        }
      }),
  )
}
