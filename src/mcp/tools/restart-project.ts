import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { projectParam, restartResultOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'restart_project',
    {
      description:
        'Restart the latest successful deployment of a project so saved environment variables and health check settings take effect. Use it after set_env or set_health_check. Do not use it to ship code changes; use deploy_project instead. When nothing needs applying it does nothing and returns deployment=null with noop=true. The app may be unavailable for a short time during the restart. Requires a token with owner, admin or developer role. Returns project and deployment{id, readyState}, or noop=true with a message. Example: {"project": "my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: restartResultOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.restartProject(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
