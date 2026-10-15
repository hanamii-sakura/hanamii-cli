import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { healthCheckResultOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_health_check',
    {
      description:
        'Get the health check settings of a project: the path and port hanamii requests after each deployment and expects to answer 200. Use it when a deployment failed with health_error, or before changing the settings with set_health_check. Read-only. Returns healthCheck{enabled, path, port}. Example: {"project": "my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: healthCheckResultOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.getHealthCheck(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
