import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { main } from '../../src/cli.js'
import type { CliDependencies } from '../../src/cli/context.js'
import { writeProjectLink } from '../../src/config/project-link.js'
import { createOutput } from '../../src/cli/output.js'
const base = 'https://operations.test/api/v1'
const server = setupServer()
let dir: string
let stdout: string
let stderr: string
let deps: CliDependencies
const run = (...args: string[]) => main(['node', 'hanamii', ...args], deps)
const envs = [{ key: 'KEY', type: 'secret', value: 'private-value' }]
const noop = { project: { id: 'prj_app' }, deployment: null, noop: true, message: '変更なし' }
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-operations-'))
  stdout = ''
  stderr = ''
  deps = {
    cwd: dir,
    home: dir,
    env: { HANAMII_TOKEN: 'hnm_auth_test', HANAMII_BASE_URL: 'https://operations.test' },
    stdout: (t) => {
      stdout += t
    },
    stderr: (t) => {
      stderr += t
    },
  }
  await writeProjectLink(dir, { projectId: 'prj_app', workspaceId: 'ws_1', name: 'app' })
  server.use(
    http.get(`${base}/projects`, () =>
      HttpResponse.json({ projects: [{ id: 'prj_app', name: 'app' }], pagination: { next: null } }),
    ),
    http.get(`${base}/projects/prj_app`, () =>
      HttpResponse.json({ project: { id: 'prj_app', workspaceId: 'ws_1' } }),
    ),
    http.post(`${base}/projects/prj_app/restart`, () => HttpResponse.json(noop)),
  )
})
afterEach(async () => {
  vi.useRealTimers()
  server.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => server.close())
it('env list は既定 key/type のみ、decrypt のときだけ値を表示', async () => {
  const queries: string[] = []
  server.use(
    http.get(`${base}/projects/prj_app/env`, ({ request }) => {
      queries.push(new URL(request.url).search)
      return HttpResponse.json({ envs })
    }),
  )
  expect(await run('env', 'list')).toBe(0)
  expect(stdout).toBe('KEY\tsecret\n')
  stdout = ''
  expect(await run('env', 'list', '--json', '--project', 'app')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ envs: [{ key: 'KEY', type: 'secret' }] })
  stdout = ''
  expect(await run('env', 'list', '--decrypt', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ envs })
  expect(queries).toEqual(['?decrypt=false', '?decrypt=false', '?decrypt=true'])
})
it('env set は = と空値を保ち secret/plain を設定、保存後だけ restart', async () => {
  const order: string[] = []
  const bodies: unknown[] = []
  server.use(
    http.patch(`${base}/projects/prj_app/env`, async ({ request }) => {
      order.push('save')
      bodies.push(await request.json())
      return HttpResponse.json({ envs })
    }),
    http.post(`${base}/projects/prj_app/restart`, () => {
      order.push('restart')
      return HttpResponse.json(noop)
    }),
  )
  expect(await run('env', 'set', 'A=x=y', 'B=')).toBe(0)
  expect(await run('env', 'set', 'C=value', '--plain', '--restart')).toBe(0)
  expect(bodies).toEqual([
    {
      envs: [
        { key: 'A', value: 'x=y', type: 'secret' },
        { key: 'B', value: '', type: 'secret' },
      ],
    },
    { envs: [{ key: 'C', value: 'value', type: 'plain' }] },
  ])
  expect(order).toEqual(['save', 'save', 'restart'])
  expect(stdout).not.toContain('private-value')
  expect(stdout).toContain('再起動不要')
  expect(await run('env', 'set', 'invalid')).toBe(2)
  expect(await run('env', 'unset', 'A')).toBe(2)
  expect(await run('env', '--help')).toBe(0)
  expect(stdout).toContain('削除 API がない')
})
it('保存失敗では再起動しない', async () => {
  const restart = vi.fn(() => HttpResponse.json(noop))
  server.use(
    http.patch(`${base}/projects/prj_app/env`, () =>
      HttpResponse.json(
        { error: { code: 'validation_error', message: 'invalid' } },
        { status: 400 },
      ),
    ),
    http.post(`${base}/projects/prj_app/restart`, restart),
  )
  expect(await run('env', 'set', 'A=x', '--restart')).toBe(1)
  expect(restart).not.toHaveBeenCalled()
})
it('restart は noop/開始とストリーム本文の認証エラーを区別', async () => {
  expect(await run('restart', '--project', 'prj_app')).toBe(0)
  expect(stdout).toContain('再起動不要')
  server.use(
    http.post(
      `${base}/projects/prj_app/restart`,
      () =>
        new HttpResponse(' \n {"project":{"id":"prj_app"},"deployment":{"readyState":"BUILDING"}}'),
    ),
  )
  expect(await run('restart')).toBe(0)
  expect(stdout).toContain('再起動開始')
  server.use(
    http.post(
      `${base}/projects/prj_app/restart`,
      () => new HttpResponse(' \n {"error":{"code":"forbidden","message":"hnm_auth_test"}}'),
    ),
  )
  expect(await run('restart', '--json')).toBe(3)
  expect(stderr).not.toContain('hnm_')
  expect(JSON.parse(stderr).error.exitCode).toBe(3)
})
it('workspace 不一致を操作前に検出', async () => {
  expect(await run('restart', '--workspace', 'ws_other')).toBe(1)
  expect(await run('restart', '--project', 'prj_app', '--workspace', 'ws_other')).toBe(2)
})
it('health-check の取得、有効化、無効化、引数検証', async () => {
  const healthCheck = { enabled: true, path: '/health', port: 8080 }
  const bodies: unknown[] = []
  server.use(
    http.get(`${base}/projects/prj_app/health-check`, () => HttpResponse.json({ healthCheck })),
    http.put(`${base}/projects/prj_app/health-check`, async ({ request }) => {
      const body = await request.json()
      bodies.push(body)
      return HttpResponse.json({ healthCheck: body })
    }),
  )
  expect(await run('health-check', 'get', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ healthCheck })
  expect(await run('health-check', 'set', '--path', '/health', '--port', '8080')).toBe(0)
  expect(await run('health-check', 'set', '--disable')).toBe(0)
  expect(bodies).toEqual([healthCheck, { enabled: false }])
  for (const args of [
    [],
    ['--port', '80'],
    ['--path', 'bad'],
    ['--path', '/health', '--port', '65536'],
    ['--disable', '--path', '/health'],
    ['--disable', '--port', '80'],
  ])
    expect(await run('health-check', 'set', ...args)).toBe(2)
})
it('logs は text を末尾改行付きで出力、JSON は logs 配列、クエリを転送', async () => {
  const logs = [{ timestamp: '2026-10-01T00:00:00Z', message: 'hello' }]
  server.use(
    http.get(`${base}/projects/prj_app/logs`, ({ request }) => {
      const q = new URL(request.url).searchParams
      expect(q.get('limit')).toBe('100')
      expect(q.get('since')).toBe('-15m')
      return q.get('format') === 'text'
        ? HttpResponse.text('09:00:00 hello')
        : HttpResponse.json({ logs })
    }),
  )
  expect(await run('logs', '--since', '-15m')).toBe(0)
  expect(stdout).toBe('09:00:00 hello\n')
  stdout = ''
  expect(await run('logs', '--json', '--before', '2026-10-02T00:00:00Z')).toBe(0)
  expect(JSON.parse(stdout)).toEqual(logs)
  expect(await run('logs', '--limit', '501')).toBe(2)
})
it('logs follow は SIGINT で 0、リスナーを解除', async () => {
  const listeners = process.listenerCount('SIGINT')
  server.use(
    http.get(`${base}/projects/prj_app/logs`, () =>
      HttpResponse.json({ logs: [{ timestamp: '2026-10-01T00:00:00Z', message: 'hello' }] }),
    ),
  )
  deps.stdout = (t) => {
    stdout += t
    process.emit('SIGINT')
  }
  expect(await run('logs', '--follow', '--json')).toBe(0)
  expect(JSON.parse(stdout)[0].message).toBe('hello')
  expect(process.listenerCount('SIGINT')).toBe(listeners)
})
it('tokens create は平文を一度だけ出し、metadata と通常出力はマスク', async () => {
  const token = { id: 'tok_1', name: 'hnm_auth_test', scopeType: 'full_account' }
  const bodies: unknown[] = []
  server.use(
    http.post(`${base}/user/tokens`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ token, bearerToken: 'hnm_new_test' })
    }),
  )
  expect(await run('tokens', 'create', '--name', 'test', '--scope', 'full_account')).toBe(0)
  expect(stdout.split('hnm_new_test')).toHaveLength(2)
  expect(stderr).toBe('')
  stdout = ''
  expect(
    await run(
      'tokens',
      'create',
      '--name',
      'test',
      '--scope',
      'workspace',
      '--workspace',
      'ws_1',
      '--expires',
      '30d',
      '--json',
    ),
  ).toBe(0)
  expect(JSON.parse(stdout)).toEqual({
    token: { ...token, name: '[REDACTED]' },
    bearerToken: 'hnm_new_test',
  })
  expect(bodies[0]).toEqual({ name: 'test', scopeType: 'full_account' })
  expect(bodies[1]).toMatchObject({ scopeWorkspaceId: 'ws_1', expiresAt: expect.any(Number) })
  const output = createOutput(
    (t) => {
      stdout += t
    },
    (t) => {
      stderr += t
    },
  )
  output.createdToken(token, 'hnm_new_test', false)
  stdout = ''
  output.result({ token: 'hnm_new_test' }, 'hnm_new_test', true)
  output.error('hnm_new_test')
  expect(stdout + stderr).not.toContain('hnm_')
})
it('tokens list/revoke と有効期限・scope検証', async () => {
  server.use(
    http.get(`${base}/user/tokens`, () =>
      HttpResponse.json({
        tokens: [
          {
            id: 'tok_1',
            name: 'test',
            scopeType: 'workspace',
            scopeWorkspaceId: 'ws_1',
            expiresAt: null,
          },
        ],
        pagination: { next: null },
      }),
    ),
    http.delete(`${base}/user/tokens/tok_1`, () =>
      HttpResponse.json({ token: { id: 'tok_1', deleted: true } }),
    ),
  )
  expect(await run('tokens', 'list')).toBe(0)
  expect(stdout).toContain('tok_1\ttest\tworkspace\tws_1\t無期限')
  stdout = ''
  expect(await run('tokens', 'revoke', 'tok_1', '--json')).toBe(0)
  expect(JSON.parse(stdout).token.deleted).toBe(true)
  for (const expiry of ['yesterday', '2020-01-01', '2030-02-30', '10d'])
    expect(
      await run('tokens', 'create', '--name', 'n', '--scope', 'full_account', '--expires', expiry),
    ).toBe(2)
  expect(await run('tokens', 'create', '--name', 'n', '--scope', 'invalid')).toBe(2)
})
it('workspace トークン作成は現在の scope または workspace 一覧から解決する', async () => {
  const bodies: unknown[] = []
  server.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'workspace', scopeWorkspaceId: 'ws_scoped' } }),
    ),
    http.post(`${base}/user/tokens`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ token: { id: 'tok_new' }, bearerToken: 'hnm_new_test' })
    }),
  )
  expect(
    await run('tokens', 'create', '--name', 'n', '--scope', 'workspace', '--expires', '90d'),
  ).toBe(0)
  expect(bodies[0]).toMatchObject({ scopeWorkspaceId: 'ws_scoped', expiresAt: expect.any(Number) })
  server.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({ workspaces: [{ id: 'ws_single', name: 'single' }] }),
    ),
  )
  const date = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
  expect(
    await run('tokens', 'create', '--name', 'n', '--scope', 'workspace', '--expires', date),
  ).toBe(0)
  expect(bodies[1]).toMatchObject({
    scopeWorkspaceId: 'ws_single',
    expiresAt: Date.parse(`${date}T00:00:00Z`),
  })
  server.use(
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({
        workspaces: [
          { id: 'ws_a', name: 'a' },
          { id: 'ws_b', name: 'b' },
        ],
      }),
    ),
  )
  expect(await run('tokens', 'create', '--name', 'n', '--scope', 'workspace')).toBe(6)
  expect(bodies).toHaveLength(2)
})
