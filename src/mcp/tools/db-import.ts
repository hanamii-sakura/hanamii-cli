import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolveProject } from '../../core/project-resolve.js'
import { format } from '../format.js'
import { projectParam } from '../schemas.js'
import { z } from 'zod'
import { databaseOut, databaseNameParam } from '../database-schemas.js'
import { isAbsolute } from 'node:path'
import { importDatabase } from '../../core/database.js'
import type { ToolContext } from '../context.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'db_import',
    {
      description:
        'Import a local SQLite file into a project with no attached database. Use it to restore a backup or migrate existing SQLite data. Requires owner or admin permission. The file must be on the MCP server filesystem and at most 100 MiB. Uploads signed parts without API credentials and starts import only after all ETags are received. Returns database metadata; poll db_get_info until ready or failed. Example: {"project":"my-app","file":"/absolute/path/backup.db"}',
      inputSchema: {
        project: projectParam,
        file: z.string().min(1).describe('Absolute path to a local SQLite file on the MCP server'),
        name: databaseNameParam,
      },
      outputSchema: databaseOut,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      context.run(async (client, token) => {
        const id = await resolveProject(client, { project: args.project })
        if (!isAbsolute(args.file)) throw new Error('SQLite ファイルは絶対パスで指定してください')
        const result = await importDatabase(client, id, args.file, args.name)
        return format(result, token)
      }),
  )
}
