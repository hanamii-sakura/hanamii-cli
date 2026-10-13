import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createClient, type HanamiiClient } from '../../src/api/client.js'
import type { Project, Token, DeployResponse, RowsPage } from '../../src/api/types.js'

const baseUrl = 'https://api.example.test'
const server = setupServer()
const client = createClient({ token: 'test-token', baseUrl })
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  vi.restoreAllMocks()
})
afterAll(() => server.close())
const token: Token = {
  id: 'tok_1',
  name: 'CLI',
  scopeType: 'full_account',
  scopeWorkspaceId: null,
  createdAt: 100,
  lastUsedAt: null,
  expiresAt: null,
}
const pagination = { count: 1, next: 100, prev: 200 }
const healthCheck = { enabled: false, path: null, port: null }
const project: Project = {
  id: 'prj_1',
  name: 'app',
  workspaceId: 'ws_1',
  status: 'healthy',
  createdAt: 100,
  updatedAt: 200,
  url: 'https://app.example.test',
  urls: [],
  runtimeStatus: { status: 'running', detail: null, syncedAt: 200 },
  healthCheck,
  latestDeployment: { id: 'dpl_1', readyState: 'READY', errorCode: null },
}
const deploy: DeployResponse = {
  project: {
    id: project.id,
    name: project.name,
    workspaceId: project.workspaceId,
    status: 'building',
    createdAt: 100,
    updatedAt: 200,
  },
  deployment: { id: 'dpl_2', readyState: 'BUILDING', errorCode: null },
}
const rows: RowsPage = {
  table: '注文/a b',
  rows: [
    {
      id: 1,
      data: { kind: 'blob', bytes: 2 },
      note: { kind: 'text', value: 'long', truncated: true },
    },
  ],
  pagination: { limit: 50, offset: 0, totalCount: 1, totalCountTruncated: false },
}
const envs = [{ key: 'A', value: 'B', type: 'secret' as const }]
const createInput = {
  name: 'app',
  workspaceId: 'ws_1',
  source: { type: 'zip' as const, checkId: 'check_1' },
  envs,
  healthCheck: { enabled: false as const },
}
interface Case {
  name: keyof HanamiiClient
  method: string
  path: string
  query?: Record<string, string>
  body?: unknown
  response: unknown
  status?: number
  run: () => Promise<unknown>
  long?: boolean
}
const cases: Case[] = [
  {
    name: 'listWorkspaces',
    method: 'GET',
    path: '/workspaces',
    response: { workspaces: [{ id: 'ws_1', name: 'team', role: 'owner' }] },
    run: () => client.listWorkspaces(),
  },
  {
    name: 'listTokens',
    method: 'GET',
    path: '/user/tokens',
    query: { limit: '10', until: '100', since: '0' },
    response: { tokens: [token], pagination },
    run: () => client.listTokens({ limit: 10, until: 100, since: 0 }),
  },
  {
    name: 'getToken',
    method: 'GET',
    path: '/user/tokens/tok_1',
    response: { token },
    run: () => client.getToken('tok_1'),
  },
  {
    name: 'getCurrentToken',
    method: 'GET',
    path: '/user/tokens/current',
    response: { token },
    run: () => client.getCurrentToken(),
  },
  {
    name: 'createToken',
    method: 'POST',
    path: '/user/tokens',
    body: { name: 'CI', scopeType: 'workspace', scopeWorkspaceId: 'ws_1', expiresAt: 123456 },
    response: { token, bearerToken: 'issued-secret' },
    run: () =>
      client.createToken({
        name: 'CI',
        scopeType: 'workspace',
        scopeWorkspaceId: 'ws_1',
        expiresAt: 123456,
      }),
  },
  {
    name: 'revokeToken',
    method: 'DELETE',
    path: '/user/tokens/current',
    response: { token: { id: token.id, deleted: true } },
    run: () => client.revokeToken('current'),
  },
  {
    name: 'listProjects',
    method: 'GET',
    path: '/projects',
    query: { workspaceId: 'ws_1', limit: '20', until: '100', since: '0' },
    response: { projects: [project], pagination },
    run: () => client.listProjects({ workspaceId: 'ws_1', limit: 20, until: 100, since: 0 }),
  },
  {
    name: 'getProject',
    method: 'GET',
    path: '/projects/prj_1',
    response: { project },
    run: () => client.getProject('prj_1'),
  },
  {
    name: 'createProject',
    method: 'POST',
    path: '/projects',
    body: createInput,
    response: deploy,
    long: true,
    run: () => client.createProject(createInput),
  },
  {
    name: 'deleteProject',
    method: 'DELETE',
    path: '/projects/prj_1',
    response: {
      project: {
        id: 'prj_1',
        deleted: false,
        deletion: 'accepted',
        operationId: 'op_1',
        requiresReview: true,
      },
    },
    status: 202,
    run: () => client.deleteProject('prj_1'),
  },
  {
    name: 'deployProject',
    method: 'POST',
    path: '/projects/prj_1/deploy',
    body: { source: { type: 'zip', checkId: 'check_1' } },
    response: deploy,
    long: true,
    run: () => client.deployProject('prj_1', { source: { type: 'zip', checkId: 'check_1' } }),
  },
  {
    name: 'restartProject',
    method: 'POST',
    path: '/projects/prj_1/restart',
    response: {
      project: deploy.project,
      deployment: null,
      noop: true,
      message: '反映する変更はありません',
    },
    long: true,
    run: () => client.restartProject('prj_1'),
  },
  {
    name: 'createUpload',
    method: 'POST',
    path: '/uploads',
    body: { workspaceId: 'ws_1', fileName: 'app.zip', contentType: 'application/zip' },
    response: {
      upload: {
        id: 'upl_1',
        uploadUrl: 'https://storage.example.test/signed',
        putCurl: 'curl ...',
        expiresAt: 900000,
      },
    },
    run: () =>
      client.createUpload({
        workspaceId: 'ws_1',
        fileName: 'app.zip',
        contentType: 'application/zip',
      }),
  },
  {
    name: 'checkUpload',
    method: 'POST',
    path: '/uploads/upl_1/check',
    body: {},
    response: { result: { checkId: 'check_1', canDeploy: true, errorCount: 0, errors: [] } },
    long: true,
    run: () => client.checkUpload('upl_1'),
  },
  {
    name: 'getEnv',
    method: 'GET',
    path: '/projects/prj_1/env',
    query: { decrypt: 'false' },
    response: { envs: [] },
    run: () => client.getEnv('prj_1', { decrypt: false }),
  },
  {
    name: 'setEnv',
    method: 'PATCH',
    path: '/projects/prj_1/env',
    body: { envs },
    response: {
      envs: [
        {
          id: 'env_1',
          key: 'A',
          type: 'secret',
          target: ['production'],
          createdAt: 100,
          updatedAt: 200,
        },
      ],
    },
    run: () => client.setEnv('prj_1', envs),
  },
  {
    name: 'getHealthCheck',
    method: 'GET',
    path: '/projects/prj_1/health-check',
    response: { healthCheck },
    run: () => client.getHealthCheck('prj_1'),
  },
  {
    name: 'setHealthCheck',
    method: 'PUT',
    path: '/projects/prj_1/health-check',
    body: { enabled: true, path: '/health', port: null },
    response: { healthCheck: { enabled: true, path: '/health', port: null } },
    run: () => client.setHealthCheck('prj_1', { enabled: true, path: '/health', port: null }),
  },
  {
    name: 'getLogs',
    method: 'GET',
    path: '/projects/prj_1/logs',
    query: { limit: '10', since: '-15m', before: '2026-01-01T00:00:00Z' },
    response: { logs: [{ timestamp: '2026-01-01T00:00:00Z', message: 'hello' }] },
    run: () =>
      client.getLogs('prj_1', { limit: 10, since: '-15m', before: '2026-01-01T00:00:00Z' }),
  },
  {
    name: 'getLogsText',
    method: 'GET',
    path: '/projects/prj_1/logs',
    query: { format: 'text' },
    response: '',
    run: () => client.getLogsText('prj_1'),
  },
  {
    name: 'getDatabase',
    method: 'GET',
    path: '/projects/prj_1/database',
    response: { database: null },
    run: () => client.getDatabase('prj_1'),
  },
  {
    name: 'listDatabaseTables',
    method: 'GET',
    path: '/projects/prj_1/database/tables',
    response: {
      tables: [
        {
          name: 'orders',
          columns: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true, isNotNull: true }],
        },
      ],
    },
    run: () => client.listDatabaseTables('prj_1'),
  },
  {
    name: 'getDatabaseRows',
    method: 'GET',
    path: `/projects/prj_1/database/tables/${encodeURIComponent(rows.table)}/rows`,
    query: { limit: '50', offset: '0' },
    response: rows,
    run: () => client.getDatabaseRows('prj_1', rows.table, { limit: 50, offset: 0 }),
  },
]
describe('API エンドポイントの契約', () => {
  it.each(cases)('$name', async (item) => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    let calls = 0
    server.use(
      http.all(`${baseUrl}/api/v1/*`, async ({ request }) => {
        calls++
        expect(request.method).toBe(item.method)
        const url = new URL(request.url)
        expect(url.pathname).toBe(`/api/v1${item.path}`)
        expect(Object.fromEntries(url.searchParams)).toEqual(item.query ?? {})
        expect(request.headers.get('authorization')).toBe('Bearer test-token')
        if (item.body === undefined) expect(await request.text()).toBe('')
        else {
          expect(request.headers.get('content-type')).toBe('application/json')
          expect(await request.json()).toEqual(item.body)
        }
        return typeof item.response === 'string'
          ? HttpResponse.text(item.response)
          : new HttpResponse(`${item.long ? ' \n  ' : ''}${JSON.stringify(item.response)}`, {
              status: item.status ?? 200,
              headers: { 'Content-Type': 'application/json' },
            })
      }),
    )
    expect(await item.run()).toEqual(item.response)
    expect(calls).toBe(1)
    expect(timeout).toHaveBeenCalledWith(item.long ? 1_200_000 : 60_000)
  })
  it('chunk check は multipart 境界を fetch に任せる', async () => {
    server.use(
      http.post(`${baseUrl}/api/v1/uploads/check`, async ({ request }) => {
        expect(request.headers.get('content-type')).toContain('multipart/form-data; boundary=')
        const body = await request.formData()
        expect(body.get('chunkIndex')).toBe('0')
        expect(body.get('totalChunks')).toBe('2')
        expect(body.get('fileName')).toBe('app.zip')
        expect(body.get('clientFiltered')).toBe('false')
        expect(await (body.get('chunk') as Blob).text()).toBe('zip data')
        return HttpResponse.json({
          complete: false,
          uploadId: 'upl_1',
          receivedChunks: 1,
          totalChunks: 2,
        })
      }),
    )
    expect(
      await client.checkUploadChunk({
        chunk: new Blob(['zip data']),
        chunkIndex: 0,
        totalChunks: 2,
        fileName: 'app.zip',
        clientFiltered: false,
      }),
    ).toMatchObject({ complete: false, uploadId: 'upl_1' })
  })
  it('公開したすべてのメソッドを契約テストで網羅する', () => {
    expect([...cases.map(({ name }) => name), 'checkUploadChunk'].sort()).toEqual(
      Object.keys(client).sort(),
    )
  })
  it('git 作成・再デプロイも source の形を保持する', async () => {
    const source = {
      type: 'git' as const,
      repoFullName: 'owner/repo',
      ref: 'main',
      rootDirectory: 'apps/web',
    }
    server.use(
      http.post(`${baseUrl}/api/v1/projects`, async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'app', source })
        return HttpResponse.json(deploy)
      }),
      http.post(`${baseUrl}/api/v1/projects/prj_1/deploy`, async ({ request }) => {
        expect(await request.json()).toEqual({ source: { type: 'git', ref: 'main' } })
        return HttpResponse.json(deploy)
      }),
    )
    await client.createProject({ name: 'app', source })
    await client.deployProject('prj_1', { source: { type: 'git', ref: 'main' } })
  })
  it('200 + error をエラーにし、check 失敗の result はそのまま返す', async () => {
    server.use(
      http.post(`${baseUrl}/api/v1/projects`, () =>
        HttpResponse.json({ error: { code: 'conflict', message: 'exists' } }),
      ),
      http.post(`${baseUrl}/api/v1/uploads/upl_1/check`, () =>
        HttpResponse.json({
          result: {
            canDeploy: false,
            errorCount: 1,
            errors: [{ type: 'invalid_project', message: 'invalid' }],
          },
        }),
      ),
    )
    await expect(client.createProject(createInput)).rejects.toMatchObject({
      status: 200,
      code: 'conflict',
    })
    expect((await client.checkUpload('upl_1')).result.canDeploy).toBe(false)
  })
  it('fetch 差し替えとキャンセル・期限上書きに対応する', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(HttpResponse.json({ workspaces: [] }))
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    await createClient({ token: 'test', baseUrl, fetch: fetcher }).listWorkspaces({
      timeoutMs: 100,
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(timeout).toHaveBeenCalledWith(100)
    await expect(client.getProject('prj_1', { signal: AbortSignal.abort() })).rejects.toMatchObject(
      { code: 'aborted' },
    )
    expect(() => client.getProject('..')).toThrow('パスの識別子が不正です')
  })
})
