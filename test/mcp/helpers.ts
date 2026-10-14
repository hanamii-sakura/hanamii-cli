import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { http, HttpResponse } from 'msw'
import { createMcpServer } from '../../src/mcp/server.js'
import type { ServerOptions } from '../../src/mcp/context.js'
export const base = 'https://mcp.test/api/v1'
export const project = {
  id: 'prj_app',
  name: 'app',
  workspaceId: 'ws_1',
  url: 'https://app.test',
  latestDeployment: { id: 'dpl_1', readyState: 'READY', errorCode: null },
  runtimeStatus: { status: 'running' },
}
export const handlers = [
  http.get(`${base}/projects`, () =>
    HttpResponse.json({ projects: [project], pagination: { count: 1, next: null, prev: null } }),
  ),
  http.get(`${base}/projects/prj_app`, () => HttpResponse.json({ project })),
]
export async function connect(options: ServerOptions = {}) {
  const server = createMcpServer({
    env: { HANAMII_TOKEN: 'hnm_mcp_test', HANAMII_BASE_URL: 'https://mcp.test' },
    ...options,
  })
  const client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  await client.connect(b)
  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}
