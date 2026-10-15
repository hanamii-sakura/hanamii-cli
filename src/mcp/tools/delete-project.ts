import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { deleteOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'delete_project',
    {
      description:
        'Permanently delete a project including its public URL, deployments, environment variables and database. This is irreversible and cannot be undone. Use it only when the user explicitly asked to delete this project, and call get_project first to confirm the target. confirmName must equal the current project name exactly; otherwise nothing is deleted. Requires a token with owner or admin role. Deletion is asynchronous: after the returned operationId it can take a few minutes until get_project returns not_found. Returns project{id, deleted, deletion: completed|accepted, operationId}. Example: {"project": "my-app", "confirmName": "my-app"}',
      inputSchema: {
        project: projectParam,
        confirmName: z
          .string()
          .min(1)
          .describe(
            'The current project name, typed exactly as get_project returns it, to confirm the deletion',
          ),
      },
      outputSchema: deleteOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const { project } = await client.getProject(id)
        if (args.confirmName !== project.name)
          throw new Error('confirmName がプロジェクト名と一致しません')
        return format(await client.deleteProject(id), token)
      }),
  )
}
