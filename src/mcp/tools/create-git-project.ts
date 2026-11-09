import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveWorkspace } from '../../core/workspace.js'
import { finishGitDeployment } from '../../core/git-deploy.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { deployOut, workspaceParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'create_git_project',
    {
      description:
        'Create a project from a GitHub repository and start its first deployment. Use it when the user wants to deploy an already connected GitHub repository rather than local files. The account must have GitHub access configured in the dashboard. Returns projectId, readyState, errorCode and exitCode; wait=true also returns the public URL. No local files or project links are changed. Example: {"name":"my-app","repoFullName":"owner/repo","ref":"main"}',
      inputSchema: {
        name: z.string().trim().min(1).describe('Name for the new hanamii project'),
        repoFullName: z
          .string()
          .regex(/^[^/\s]+\/[^/\s]+$/)
          .describe(
            'GitHub repository in owner/repo form, accessible through the linked GitHub account',
          ),
        ref: z
          .string()
          .trim()
          .min(1)
          .describe('Git branch or reference for the initial deployment'),
        rootDirectory: z
          .string()
          .optional()
          .describe('App root directory inside the repository; omitted means repository root'),
        workspaceId: workspaceParam,
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
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args, extra) =>
      context.run(async (client, token) => {
        const workspaceId = await resolveWorkspace(client, args.workspaceId)
        const response = await client.createProject(
          {
            name: args.name,
            ...(workspaceId ? { workspaceId } : {}),
            source: {
              type: 'git',
              repoFullName: args.repoFullName,
              ref: args.ref,
              ...(args.rootDirectory === undefined ? {} : { rootDirectory: args.rootDirectory }),
            },
          },
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
