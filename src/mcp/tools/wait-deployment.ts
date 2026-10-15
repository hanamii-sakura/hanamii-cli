import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { waitForDeployment } from '../../core/poll.js'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { progress } from '../progress.js'
import { projectParam, waitOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'wait_deployment',
    {
      description:
        'Wait until the current deployment of a project reaches READY or ERROR and return the final state. Use it after deploy_project with wait=false, or to confirm a deployment started elsewhere. Do not use it for a quick status check; prefer get_project, which returns at once. If no deployment is in progress it returns the current state immediately. timeoutSec is 1-600 (default 600); exceeding it is an error. Returns projectId, url, readyState and errorCode. On ERROR the result has isError=true, so call get_logs next. Example: {"project": "my-app", "timeoutSec": 300}',
      inputSchema: {
        project: projectParam,
        timeoutSec: z
          .number()
          .int()
          .min(1)
          .max(600)
          .default(600)
          .describe('Maximum seconds to wait, 1-600 (default 600)'),
      },
      outputSchema: waitOut,
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
