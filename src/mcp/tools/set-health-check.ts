import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { resolveProject } from '../../core/project-resolve.js'
import type { ToolContext } from '../context.js'
import { format } from '../format.js'
import { healthCheckResultOut, projectParam } from '../schemas.js'
export function register(server: McpServer, context: ToolContext) {
  server.registerTool(
    'set_health_check',
    {
      description:
        'Configure the health check hanamii runs after each deployment (a GET that must answer 200). Use it when the app exposes an endpoint such as /health, or to disable a check that keeps failing with health_error. With enabled=true the path is required and must start with "/"; port defaults to the app port. enabled=false turns the check off. The change is applied by restart_project or the next deploy_project. Use get_health_check to see the current settings. Requires a token with owner, admin or developer role. Returns healthCheck{enabled, path, port}. Example: {"project": "my-app", "enabled": true, "path": "/health"}',
      inputSchema: {
        project: projectParam,
        enabled: z
          .boolean()
          .describe('true enables the health check (path required); false disables it'),
        path: z
          .string()
          .startsWith('/')
          .optional()
          .describe('Request path starting with "/", e.g. "/health". Required when enabled=true'),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .nullable()
          .optional()
          .describe('Port to probe, 1-65535. Omit or pass null to use the app port'),
      },
      outputSchema: healthCheckResultOut,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) =>
      context.run(async (client, token) => {
        if (args.enabled && !args.path) throw new Error('enabled=true には path が必要です')
        const body = args.enabled
          ? {
              enabled: true as const,
              path: args.path!,
              ...(args.port === undefined ? {} : { port: args.port }),
            }
          : { enabled: false as const }
        return format(
          await client.setHealthCheck(
            await resolveProject(client, { project: args.project }),
            body,
          ),
          token,
        )
      }),
  )
}
