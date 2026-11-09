import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { finishGitDeployment } from '../../core/git-deploy.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { deployOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'redeploy_git_project',
    {
      description:
        'Redeploy an existing project from its saved GitHub repository and branch. Use it to publish committed changes for a project already connected to GitHub. This tool does not switch branches, upload local files or change local project links. The API rejects projects without a usable GitHub source. Returns projectId, readyState, errorCode and exitCode; wait=true also returns the public URL. Example: {"project":"my-app","wait":false}',
      inputSchema: {
        project: projectParam,
        wait: z
          .boolean()
          .default(true)
          .describe('Wait for deployment completion; false returns the initial deployment state'),
        timeoutSec: z
          .number()
          .int()
          .min(1)
          .max(900)
          .default(900)
          .describe('Maximum seconds to wait for deployment completion, from 1 to 900'),
      },
      outputSchema: deployOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args, extra) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const response = await client.deployProject(
          id,
          { source: { type: 'git' } },
          { retryRateLimit: false },
        )
        const result = await finishGitDeployment(
          client,
          response,
          args.wait,
          args.timeoutSec,
          extra.signal,
        )
        return format(result, token, result.exitCode !== 0)
      }),
  )
}
