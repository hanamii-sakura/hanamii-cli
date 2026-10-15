import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import { fetchLogs } from '../../core/logs.js'
import { readOnly, type ToolContext } from '../context.js'
import { format } from '../format.js'
import { logsOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'get_logs',
    {
      description:
        'Get runtime logs (stdout and stderr) of the running app for a project. Use it after a deployment when the app does not start, returns 500, or fails its health check. Build logs are not included; check them in the hanamii dashboard instead. since accepts a relative window such as "-15m" or "-1h" or an ISO 8601 timestamp; limit is 1-500; before (ISO 8601) returns only older lines, for paging back in time. Returns text lines "timestamp message" and structuredContent logs[]{timestamp, message}. Example: {"project": "my-app", "since": "-1h", "limit": 200}',
      inputSchema: {
        project: projectParam,
        since: z
          .string()
          .default('-15m')
          .describe(
            'Start of the time window: a relative value like "-15m" or "-2h", or an ISO 8601 timestamp. Default "-15m"',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe('Maximum number of log lines to return, 1-500 (default 100)'),
        before: z
          .string()
          .optional()
          .describe(
            'ISO 8601 timestamp; only lines older than this are returned. Use it to page back through older logs',
          ),
      },
      outputSchema: logsOut,
      annotations: readOnly,
    },
    (args) =>
      context.run(async (client, token) => {
        const result = await fetchLogs(
          client,
          await resolveProject(client, { project: args.project }),
          {
            since: args.since,
            limit: args.limit,
            ...(args.before === undefined ? {} : { before: args.before }),
          },
        )
        return format(
          result,
          token,
          false,
          result.logs.map((log) => `${log.timestamp} ${log.message}`).join('\n'),
        )
      }),
  )
}
