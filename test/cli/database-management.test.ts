import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { main } from '../../src/cli.js'
import type { CliDependencies } from '../../src/cli/context.js'
const path = 'https://db-cli.test/api/v1/projects/prj_app/database'
const db = { id: 'pdb_1', name: 'app-db', status: 'creating' }
const bytes = Buffer.from('SQLite format 3\0data')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const job = { id: 'exp_1', status: 'ready' }
const api = setupServer()
let dir: string, stdout: string, stderr: string, deps: CliDependencies
const run = (...args: string[]) =>
  main(['node', 'hanamii', 'db', '--project', 'prj_app', ...args], deps)
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-db-cli-'))
  stdout = ''
  stderr = ''
  deps = {
    cwd: dir,
    home: dir,
    env: { HANAMII_TOKEN: 'hnm_test', HANAMII_BASE_URL: 'https://db-cli.test' },
    isInteractive: false,
    stdout: (t) => {
      stdout += t
    },
    stderr: (t) => {
      stderr += t
    },
  }
})
afterEach(async () => {
  vi.useRealTimers()
  api.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => api.close())
it('DB作成・トークン一覧/発行/失効と入力検証', async () => {
  const bodies: unknown[] = []
  api.use(
    http.post(path, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ database: db })
    }),
    http.get(`${path}/auth-tokens`, () => HttpResponse.json({ authTokens: [] })),
    http.post(`${path}/auth-tokens`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({
        authToken: null,
        token: 'db-secret',
        databaseUrl: 'libsql://db.test',
      })
    }),
    http.delete(`${path}/auth-tokens/dbtok_1`, () =>
      HttpResponse.json({ authToken: { id: 'dbtok_1', status: 'revoked' } }),
    ),
  )
  expect(await run('create', '--name', 'app-db', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ database: db })
  stdout = ''
  expect(await run('tokens', 'list', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ authTokens: [] })
  stdout = ''
  expect(
    await run(
      'tokens',
      'create',
      '--name',
      'app',
      '--permission',
      'read_only',
      '--ttl',
      '60',
      '--json',
    ),
  ).toBe(0)
  expect(JSON.parse(stdout).token).toBe('db-secret')
  expect(stderr).toBe('')
  expect(await run('tokens', 'revoke', 'dbtok_1')).toBe(0)
  expect(bodies).toEqual([
    { name: 'app-db' },
    { name: 'app', permission: 'read_only', ttlSeconds: 60 },
  ])
  for (const args of [
    ['create', '--name', 'x'.repeat(101)],
    ['tokens', 'create', '--ttl', '0'],
    ['tokens', 'create', '--permission', 'admin'],
  ])
    expect(await run(...args)).toBe(2)
})
it('DB削除はDB名で確認し、非対話はyes必須', async () => {
  const deleted = vi.fn(() => HttpResponse.json({ database: null }))
  api.use(
    http.get(path, () => HttpResponse.json({ database: db })),
    http.delete(path, deleted),
  )
  expect(await run('delete')).toBe(2)
  deps.isInteractive = true
  deps.promptProjectName = async () => 'project-name'
  expect(await run('delete')).toBe(1)
  expect(deleted).not.toHaveBeenCalled()
  deps.promptProjectName = async (name) => {
    expect(name).toBe('app-db')
    return name
  }
  expect(await run('delete', '--json')).toBe(0)
  expect(JSON.parse(stdout)).toEqual({ database: null })
  deps.isInteractive = false
  expect(await run('delete', '--yes')).toBe(0)
})
it('エクスポートの待機・再開・署名URL・検証付き保存、既存ファイルを保護する', async () => {
  let pending = false
  let badHash = false
  const create = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({ idempotencyKey: 'backup' })
    return HttpResponse.json({ exportJob: job })
  })
  api.use(
    http.post(`${path}/exports`, create),
    http.get(`${path}/exports/exp_1`, () =>
      HttpResponse.json({
        exportJob: pending ? { ...job, status: 'failed', failureCode: 'export_failed' } : job,
      }),
    ),
    http.post(`${path}/exports/exp_1/download`, () =>
      HttpResponse.json({
        download: {
          url: 'https://storage.test/db',
          sizeBytes: bytes.length,
          sha256: badHash ? 'wrong' : sha256,
        },
      }),
    ),
    http.get('https://storage.test/db', ({ request }) => {
      expect(request.headers.has('authorization')).toBe(false)
      return new HttpResponse(bytes)
    }),
  )
  expect(await run('export', '--idempotency-key', 'backup', '--json')).toBe(0)
  expect(JSON.parse(stdout).download.url).toBe('https://storage.test/db')
  stdout = ''
  expect(await run('export', '--job', 'exp_1', '--output', 'backup.db', '--json')).toBe(0)
  expect(await readFile(join(dir, 'backup.db'))).toEqual(bytes)
  if (process.platform !== 'win32')
    expect((await stat(join(dir, 'backup.db'))).mode & 0o777).toBe(0o600)
  expect(await run('export', '--job', 'exp_1', '--output', 'backup.db')).toBe(1)
  expect(await readFile(join(dir, 'backup.db'))).toEqual(bytes)
  badHash = true
  expect(await run('export', '--job', 'exp_1', '--output', 'bad.db')).toBe(1)
  await expect(stat(join(dir, 'bad.db'))).rejects.toMatchObject({ code: 'ENOENT' })
  pending = true
  expect(await run('export', '--job', 'exp_1')).toBe(1)
  expect(await run('export', '--job', 'exp_1', '--no-wait')).toBe(0)
  expect(create).toHaveBeenCalledTimes(1)
  expect(await run('export', '--no-wait', '--output', 'bad.db')).toBe(2)
})
it('エクスポートのnullと待機期限を扱う', async () => {
  api.use(http.get(`${path}/exports/exp_1`, () => HttpResponse.json({ exportJob: null })))
  expect(await run('export', '--job', 'exp_1')).toBe(1)
  expect(stderr).toContain('エクスポートジョブ')
  api.use(
    http.get(`${path}/exports/exp_1`, () =>
      HttpResponse.json({ exportJob: { ...job, status: 'running' } }),
    ),
  )
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  const result = run('export', '--job', 'exp_1', '--timeout', '1')
  await vi.advanceTimersByTimeAsync(1100)
  expect(await result).toBe(11)
})
it('ローカルSQLiteの取込開始とnullセッションエラー', async () => {
  await writeFile(join(dir, 'backup.db'), bytes)
  let missing = false
  const start = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({
      name: 'restored',
      sessionId: 's1',
      parts: [{ partNumber: 1, etag: 'etag' }],
    })
    return HttpResponse.json({ database: { ...db, status: 'importing' } })
  })
  api.use(
    http.post(`${path}/import-session`, () =>
      HttpResponse.json({
        session: missing
          ? null
          : {
              sessionId: 's1',
              partSizeBytes: bytes.length,
              parts: [
                { partNumber: 1, url: 'https://storage.test/part', contentLength: bytes.length },
              ],
              expiresAt: null,
            },
      }),
    ),
    http.put(
      'https://storage.test/part',
      () => new HttpResponse(null, { headers: { etag: 'etag' } }),
    ),
    http.post(`${path}/import-start`, start),
  )
  expect(await run('import', 'backup.db', '--name', 'restored', '--json')).toBe(0)
  expect(JSON.parse(stdout).database.status).toBe('importing')
  missing = true
  expect(await run('import', 'backup.db')).toBe(1)
  expect(stderr).toContain('アップロードセッション')
  expect(start).toHaveBeenCalledTimes(1)
})
