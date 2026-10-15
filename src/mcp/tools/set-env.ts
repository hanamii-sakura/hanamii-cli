import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { envSchema, projectParam, setEnvOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'set_env',
    {
      description:
        'Add or overwrite environment variables of a project (upsert). Use it to give the app API keys, connection strings or feature flags. Variables cannot be deleted through this tool; remove unneeded keys in the dashboard. Saving alone does not affect the running app: pass restart=true to restart and apply the values, or leave it false when a deploy_project will follow anyway. Use get_env to check existing keys first. Requires a token with owner, admin or developer role; viewers cannot change variables. Returns envs[]{key, type} without values and, when restart=true, the restart result. Example: {"project": "my-app", "envs": [{"key": "API_KEY", "value": "xxxx"}], "restart": true}',
      inputSchema: {
        project: projectParam,
        envs: z
          .array(envSchema)
          .min(1)
          .describe(
            'Variables to save, at least one. An existing key with the same name is overwritten',
          ),
        restart: z
          .boolean()
          .default(false)
          .describe(
            'When true, restart the app after saving so the new values take effect. Default false saves only',
          ),
      },
      outputSchema: setEnvOut,
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
