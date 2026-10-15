import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { deploy } from '../../core/deploy.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { progress } from '../progress.js'
import { deployOut, envSchema, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'deploy_project',
    {
      description:
        'Deploy a local directory to hanamii as a ZIP upload and return the public URL. Use name to create a new project, or project (ID or name) to redeploy an existing one; never pass both. project can be omitted when dir contains .hanamii/project.json written by a previous deploy. node_modules, .git and .env files are excluded automatically. The directory must contain package.json with scripts.start (Node.js), composer.json plus a Dockerfile (PHP), or requirements.txt or pyproject.toml (Python). envs are saved before the deployment starts. With wait=true (default) the tool blocks until the deployment is READY or ERROR, up to timeoutSec seconds; with wait=false it returns right after the upload and you should call wait_deployment next. Returns projectId, url, readyState, errorCode (check_error | build_error | deploy_error | health_error) and, when the pre-check rejects the upload, check.errors[]. A failed deployment sets isError=true; use get_logs to find the cause. Example: {"dir": "/path/to/app", "name": "my-app"}',
      inputSchema: {
        dir: z
          .string()
          .min(1)
          .describe(
            'Directory of the app to deploy, preferably an absolute path, e.g. "/Users/me/app"',
          ),
        name: z
          .string()
          .min(1)
          .optional()
          .describe(
            'Name for a new project. Do not pass it when updating an existing project (mutually exclusive with project)',
          ),
        project: projectParam
          .optional()
          .describe(
            'Existing project to redeploy: its ID (UUID) or exact name. Optional when dir contains .hanamii/project.json (mutually exclusive with name)',
          ),
        workspaceId: z
          .string()
          .optional()
          .describe(
            'Workspace ID (UUID) from list_workspaces for a new project. Optional when the account has a single workspace',
          ),
        envs: z
          .array(envSchema)
          .optional()
          .describe(
            'Environment variables to save before deploying, e.g. [{"key": "NODE_ENV", "value": "production", "type": "plain"}]',
          ),
        wait: z
          .boolean()
          .default(true)
          .describe(
            'true (default) waits for the final state; false returns as soon as the deployment has started',
          ),
        timeoutSec: z
          .number()
          .int()
          .min(1)
          .max(900)
          .default(900)
          .describe('Maximum seconds to wait when wait=true, 1-900 (default 900)'),
      },
      outputSchema: deployOut,
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
