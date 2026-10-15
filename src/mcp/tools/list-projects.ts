import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { projectsOut } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'list_projects',
    {
      description:
        'List hanamii projects with their public URL and latest deployment state. Use it to see which projects exist, to look up a project ID by name, or to decide whether deploy_project should create (name) or update (project). For one project\'s details prefer get_project instead. workspaceId narrows the list to one workspace; limit is 1-100 (default 20). Returns projects[] with id (UUID), name, url, workspaceId, latestDeployment{readyState, errorCode} plus pagination{count, next, prev}. Example: {"limit": 50} or {"workspaceId": "<uuid>"}',
      inputSchema: {
        workspaceId: z
          .string()
          .optional()
          .describe(
            'Workspace ID (UUID) from list_workspaces to filter by. Omit to list every workspace',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('Maximum number of projects to return, 1-100 (default 20)'),
      },
      outputSchema: projectsOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) =>
        format(
          await client.listProjects({
            ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
          }),
          token,
        ),
      ),
  )
}
