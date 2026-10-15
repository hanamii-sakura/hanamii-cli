import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { projectDetailOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_project',
    {
      description:
        'Get one hanamii project with its public URL, latest deployment (readyState and errorCode) and runtime status. Use it to check whether a deployment succeeded, whether the app is running, or to resolve a name to an ID. Use get_logs instead when you need runtime logs, and wait_deployment when a deployment is still in progress. Read-only. Returns project{id, name, url, urls[], workspaceId, latestDeployment{id, readyState: QUEUED|BUILDING|READY|ERROR, errorCode}, runtimeStatus{status, detail}, healthCheck}. Example: {"project": "my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: projectDetailOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.getProject(await resolveProject(client, { project: args.project })),
          token,
        ),
      ),
  )
}
