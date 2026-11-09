import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { databaseOut } from '../database-schemas.js'
import { readOnly, type ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_get_info',
    {
      description:
        'Get the attached database and its current provisioning status. Use it to check whether a database exists and to advance asynchronous creation, import or deletion until ready or null. Any project member can read it. Returns database metadata or null when absent. Example: {"project":"my-app"}',
      inputSchema: { project: projectParam },
      outputSchema: databaseOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        const result = await client.getDatabase(id)
        return format(result, token)
      }),
  )
}
