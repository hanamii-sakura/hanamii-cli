import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ProgressNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { removeProjectLink } from '../../src/config/project-link.js'

const token = process.env.HANAMII_TOKEN
const workspaceId = process.env.HANAMII_E2E_WORKSPACE
const dir = fileURLToPath(new URL('../fixtures/sample-node-app/', import.meta.url))
const cliPath = fileURLToPath(new URL('../../dist/cli.js', import.meta.url))
const LONG = { timeout: 900_000 }

type ToolResult = { isError?: boolean; structuredContent?: Record<string, unknown> }

/** 実際の stdio サーバー（dist/cli.js mcp --allow-delete）に接続する */
async function connect(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp', '--allow-delete'],
    env: {
      ...process.env,
      HANAMII_TOKEN: token ?? '',
      ...(process.env.HANAMII_BASE_URL ? { HANAMII_BASE_URL: process.env.HANAMII_BASE_URL } : {}),
    },
    stderr: 'pipe',
  })
  const client = new Client({ name: 'hanamii-cli-integration', version: '0' })
  await client.connect(transport)
  return client
}

describe.skipIf(!token)('MCP サーバー（stdio、読取）', () => {
  let client: Client
  beforeAll(async () => {
    client = await connect()
  })
  afterAll(async () => {
    await client.close()
  })

  it('ツール一覧に delete_project を含む 14 ツールがある', async () => {
    const { tools } = await client.listTools()
    expect(tools.length).toBe(14)
    expect(tools.map((t) => t.name)).toContain('delete_project')
  })

  it('list_workspaces が成功する', async () => {
    const result = (await client.callTool({ name: 'list_workspaces', arguments: {} })) as ToolResult
    expect(result.isError).toBeUndefined()
    expect(Array.isArray(result.structuredContent?.workspaces)).toBe(true)
  })
})

describe.skipIf(!token || process.env.HANAMII_E2E_DEPLOY !== '1' || !workspaceId)(
  'MCP サーバー（stdio、デプロイ E2E）',
  () => {
    let client: Client
    const name = `mcp-it-${Math.floor(Date.now() / 1000)}`
    let projectId: string | undefined
    let deleted = false

    beforeAll(async () => {
      client = await connect()
    })
    afterAll(async () => {
      try {
        if (projectId && !deleted)
          await client.callTool(
            { name: 'delete_project', arguments: { project: projectId, confirmName: name } },
            undefined,
            LONG,
          )
      } finally {
        await client.close()
        await removeProjectLink(dir)
      }
    })

    it('deploy_project → get_logs → set_env → restart_project → delete_project', async () => {
      const progress: number[] = []
      client.setNotificationHandler(ProgressNotificationSchema, (n) => {
        progress.push(n.params.progress)
      })
      const deployed = (await client.callTool(
        {
          name: 'deploy_project',
          arguments: { dir, name, workspaceId, wait: true, timeoutSec: 600 },
          _meta: { progressToken: 'deploy' },
        },
        undefined,
        LONG,
      )) as ToolResult
      expect(deployed.isError).toBeUndefined()
      expect(deployed.structuredContent).toMatchObject({ readyState: 'READY' })
      projectId = deployed.structuredContent?.projectId as string
      expect(typeof projectId).toBe('string')
      expect(String(deployed.structuredContent?.url).startsWith('https://')).toBe(true)
      expect(progress.length).toBeGreaterThan(0)

      const logs = (await client.callTool({
        name: 'get_logs',
        arguments: { project: projectId, since: '-30m', limit: 50 },
      })) as ToolResult & { content: { type: string; text?: string }[] }
      expect(logs.isError).toBeUndefined()
      expect(logs.content[0]?.text).toContain('node server.js')

      const set = (await client.callTool({
        name: 'set_env',
        arguments: { project: projectId, envs: [{ key: 'SMOKE', value: '1' }], restart: false },
      })) as ToolResult
      expect(set.isError).toBeUndefined()
      const env = (await client.callTool({
        name: 'get_env',
        arguments: { project: projectId, decrypt: true },
      })) as ToolResult
      const envs = env.structuredContent?.envs as { key: string; value?: string; type: string }[]
      expect(envs.some((e) => e.key === 'SMOKE' && e.value === '1' && e.type === 'secret')).toBe(
        true,
      )

      const restarted = (await client.callTool(
        { name: 'restart_project', arguments: { project: projectId } },
        undefined,
        LONG,
      )) as ToolResult
      expect(restarted.isError).toBeUndefined()

      const rejected = (await client.callTool({
        name: 'delete_project',
        arguments: { project: projectId, confirmName: `${name}-wrong` },
      })) as ToolResult
      expect(rejected.isError).toBe(true)

      const removed = (await client.callTool(
        { name: 'delete_project', arguments: { project: projectId, confirmName: name } },
        undefined,
        LONG,
      )) as ToolResult
      expect(removed.isError).toBeUndefined()
      deleted = true

      // 削除は非同期。get_project が not_found を返すまで待つ
      const deadline = Date.now() + 180_000
      let gone = false
      while (Date.now() < deadline && !gone) {
        const got = (await client.callTool({
          name: 'get_project',
          arguments: { project: projectId },
        })) as ToolResult
        gone = got.isError === true
        if (!gone) await new Promise((r) => setTimeout(r, 5_000))
      }
      expect(gone).toBe(true)
    })
  },
)
