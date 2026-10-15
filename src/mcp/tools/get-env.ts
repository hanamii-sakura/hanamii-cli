import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { envsOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_env',
    {
      description:
        'List the environment variables stored for a project. Use it to check which keys are configured. By default (decrypt=false) it returns only key and type, never the value. Set decrypt=true only when the value itself is required, and do not copy decrypted values anywhere else: they are secrets. Use set_env to add or change variables. Requires a token that can read the project (any role). Returns envs[]{key, type: secret|plain, value (only when decrypt=true)}. Example: {"project": "my-app"}',
      inputSchema: {
        project: projectParam,
        decrypt: z
          .boolean()
          .default(false)
          .describe(
            'When true, include the decrypted value of each variable. Default false returns key and type only',
          ),
      },
      outputSchema: envsOut,
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
