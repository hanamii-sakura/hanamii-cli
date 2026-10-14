import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { base, handlers, connect, project } from './helpers.js'
import { saveToken } from '../../src/config/store.js'
const api = setupServer(...handlers)
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  api.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => api.close())

it('読取8ツールの一覧・annotations・HTTP応答とstdout非出力', async () => {
  const responses = [
    ['list_workspaces', {}, '/workspaces', { workspaces: [] }],
    [
      'list_projects',
      { workspaceId: 'ws_1', limit: 10 },
      '/projects',
      { projects: [project], pagination: { next: null } },
    ],
    ['get_project', { project: 'app' }, '/projects/prj_app', { project }],
    [
      'get_logs',
      { project: 'prj_app' },
      '/projects/prj_app/logs',
      { logs: [{ timestamp: 'now', message: 'hello' }] },
    ],
    [
      'get_env',
      { project: 'prj_app' },
      '/projects/prj_app/env',
      { envs: [{ key: 'A', type: 'secret', value: 'hidden' }] },
    ],
    [
      'get_health_check',
      { project: 'prj_app' },
      '/projects/prj_app/health-check',
      { healthCheck: { enabled: false } },
    ],
    ['db_list_tables', { project: 'prj_app' }, '/projects/prj_app/database/tables', { tables: [] }],
    [
      'db_query_rows',
      { project: 'prj_app', table: 'users' },
      '/projects/prj_app/database/tables/users/rows',
      { rows: [], pagination: { offset: 0 } },
    ],
  ] as const
  for (const [, , path, data] of responses)
    api.use(http.get(base + path, () => HttpResponse.json(data)))
  const session = await connect()
  try {
    const list = await session.client.listTools()
    expect(
      list.tools
        .filter((t) => t.annotations?.readOnlyHint && t.name !== 'wait_deployment')
        .map((t) => t.name)
        .sort(),
    ).toEqual(responses.map((r) => r[0]).sort())
    for (const tool of list.tools.filter((t) => t.annotations?.readOnlyHint))
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      })
    const stdout = vi.spyOn(process.stdout, 'write')
    for (const [name, args, , data] of responses) {
      const result = await session.client.callTool({ name, arguments: args })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent).toEqual(
        name === 'get_env' ? { envs: [{ key: 'A', type: 'secret' }] } : data,
      )
    }
    expect(stdout).not.toHaveBeenCalled()
  } finally {
    await session.close()
  }
})
it('decrypt の明示時だけ値を返し、成功と失敗のトークンを伏字にする', async () => {
  api.use(
    http.get(base + '/projects/prj_app/env', ({ request }) => {
      expect(new URL(request.url).searchParams.get('decrypt')).toBe('true')
      return HttpResponse.json({
        envs: [
          { key: 'A', type: 'plain', value: 'visible' },
          { key: 'TOKEN', type: 'secret', value: 'hnm_mcp_test' },
        ],
      })
    }),
  )
  const s = await connect()
  try {
    const result = await s.client.callTool({
      name: 'get_env',
      arguments: { project: 'prj_app', decrypt: true },
    })
    expect(JSON.stringify(result)).toContain('visible')
    expect(JSON.stringify(result)).not.toContain('hnm_')
    api.use(
      http.get(base + '/workspaces', () =>
        HttpResponse.json({ error: { code: 'forbidden', message: 'denied hnm_mcp_test' } }),
      ),
    )
    const error = await s.client.callTool({ name: 'list_workspaces' })
    expect(error.isError).toBe(true)
    expect(JSON.stringify(error)).toContain('[REDACTED]')
    expect(JSON.stringify(error)).not.toContain('hnm_')
    expect(
      (
        await s.client.callTool({
          name: 'db_query_rows',
          arguments: { project: 'prj_app', table: 'x', limit: 101 },
        })
      ).isError,
    ).toBe(true)
  } finally {
    await s.close()
  }
})
it('未認証でも接続でき、呼出時にloginを案内。設定ファイルより環境変数を優先', async () => {
  const home = await mkdtemp(join(tmpdir(), 'mcp-auth-'))
  try {
    const s = await connect({ env: {}, home })
    try {
      expect(JSON.stringify(await s.client.callTool({ name: 'list_workspaces' }))).toContain(
        'hanamii login を実行してください',
      )
    } finally {
      await s.close()
    }
    await saveToken('https://mcp.test', 'config-token', { env: {}, home })
    for (const token of ['config-token', 'env-token']) {
      api.use(
        http.get(base + '/workspaces', ({ request }) => {
          expect(request.headers.get('authorization')).toBe('Bearer ' + token)
          return HttpResponse.json({ workspaces: [] })
        }),
      )
      const s = await connect({
        home,
        env: {
          HANAMII_BASE_URL: 'https://mcp.test',
          ...(token === 'env-token' ? { HANAMII_TOKEN: token } : {}),
        },
      })
      try {
        expect((await s.client.callTool({ name: 'list_workspaces' })).isError).not.toBe(true)
      } finally {
        await s.close()
      }
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
