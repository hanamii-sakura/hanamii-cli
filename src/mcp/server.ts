import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { VERSION } from '../version.js'
import { createToolContext, type ServerOptions } from './context.js'
import { register as register0 } from './tools/list-workspaces.js'
import { register as register1 } from './tools/list-projects.js'
import { register as register2 } from './tools/get-project.js'
import { register as register3 } from './tools/get-logs.js'
import { register as register4 } from './tools/get-env.js'
import { register as register5 } from './tools/get-health-check.js'
import { register as register6 } from './tools/db-list-tables.js'
import { register as register7 } from './tools/db-query-rows.js'

export function createMcpServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'hanamii', version: VERSION })
  const context = createToolContext(options)
  register0(server, context)
  register1(server, context)
  register2(server, context)
  register3(server, context)
  register4(server, context)
  register5(server, context)
  register6(server, context)
  register7(server, context)
  return server
}
export async function startMcpServer(options: ServerOptions = {}): Promise<McpServer> {
  const server = createMcpServer(options)
  await server.connect(new StdioServerTransport())
  return server
}
