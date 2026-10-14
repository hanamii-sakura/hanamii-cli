import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { waitForDeployment } from '../../core/poll.js'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { progress } from '../progress.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'wait_deployment',
    {
      description: 'デプロイが READY または ERROR になるまで待機',
      inputSchema: {
        project: z.string().min(1),
        timeoutSec: z.number().int().min(1).max(600).default(600),
      },
      annotations: readOnly,
    },
    (args, extra) =>
      context.run(async (client, token) => {
        const events = progress(extra, token)
        try {
          const project = await waitForDeployment(
            client,
            await resolveProject(client, { project: args.project }),
            {
              timeoutMs: args.timeoutSec * 1000,
              signal: extra.signal,
              onTick: (p) =>
                events.notify({
                  projectId: p.id,
                  readyState: p.latestDeployment?.readyState ?? null,
                }),
            },
          )
          return format(
            {
              projectId: project.id,
              url: project.url,
              readyState: project.latestDeployment!.readyState,
              errorCode: project.latestDeployment!.errorCode,
            },
            token,
            project.latestDeployment!.readyState === 'ERROR',
          )
        } finally {
          await events.flush()
        }
      }),
  )
}
