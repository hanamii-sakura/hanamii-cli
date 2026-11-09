import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { base, connect, handlers } from './helpers.js'
const path = `${base}/projects/prj_app/database`
const db = {
  id: 'pdb_1',
  name: 'app-db',
  slug: 'app-db',
  status: 'ready',
  hostname: 'db.test',
  failureReason: null,
  createdAt: null,
}
const job = {
  id: 'exp_1',
  status: 'ready',
  failureCode: null,
  artifactSizeBytes: 20,
  artifactSha256: 'hash',
  artifactAvailableUntil: null,
  createdAt: null,
}
const download = {
  url: 'https://storage.test/export',
  urlExpiresAt: null,
  availableUntil: null,
  sizeBytes: 20,
  sha256: 'hash',
  fileName: 'app.db',
}
const api = setupServer(...handlers)
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => api.resetHandlers())
afterAll(() => api.close())
it('DB管理の情報・作成・トークン・エクスポートを呼び出す', async () => {
  const bodies: unknown[] = []
  api.use(
    http.get(path, () => HttpResponse.json({ database: db })),
    http.post(path, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ database: { ...db, status: 'creating' } })
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
    http.post(`${path}/exports`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ exportJob: job })
    }),
    http.get(`${path}/exports/exp_1`, () => HttpResponse.json({ exportJob: job })),
    http.post(`${path}/exports/exp_1/download`, () => HttpResponse.json({ download })),
  )
  const s = await connect()
  try {
    for (const [name, args, result] of [
      ['db_get_info', {}, { database: db }],
      ['db_create', { name: 'app-db' }, { database: { ...db, status: 'creating' } }],
      ['db_list_tokens', {}, { authTokens: [] }],
      [
        'db_create_token',
        { permission: 'read_only', ttlSeconds: 60 },
        { authToken: null, token: 'db-secret', databaseUrl: 'libsql://db.test' },
      ],
      [
        'db_revoke_token',
        { tokenId: 'dbtok_1' },
        { authToken: { id: 'dbtok_1', status: 'revoked' } },
      ],
      ['db_create_export', { idempotencyKey: 'backup' }, { exportJob: job }],
      ['db_get_export', { exportJobId: 'exp_1' }, { exportJob: job }],
      ['db_get_export_download', { exportJobId: 'exp_1' }, { download }],
    ] as const)
      expect(
        (await s.client.callTool({ name, arguments: { project: 'app', ...args } }))
          .structuredContent,
      ).toEqual(result)
    expect(bodies).toEqual([
      { name: 'app-db' },
      { permission: 'read_only', ttlSeconds: 60 },
      { idempotencyKey: 'backup' },
    ])
    expect(
      (
        await s.client.callTool({
          name: 'db_create_token',
          arguments: { project: 'app', ttlSeconds: 0 },
        })
      ).isError,
    ).toBe(true)
    expect(bodies).toHaveLength(3)
  } finally {
    await s.close()
  }
})
it('削除はopt-inとDB名確認を要求し、nullも返せる', async () => {
  const del = vi.fn(() => HttpResponse.json({ database: null }))
  api.use(
    http.get(path, () => HttpResponse.json({ database: db })),
    http.delete(path, del),
  )
  const normal = await connect()
  expect((await normal.client.listTools()).tools.map((t) => t.name)).not.toContain('db_delete')
  await normal.close()
  const s = await connect({ allowDelete: true })
  try {
    expect(
      (
        await s.client.callTool({
          name: 'db_delete',
          arguments: { project: 'app', confirmName: 'app' },
        })
      ).isError,
    ).toBe(true)
    expect(del).not.toHaveBeenCalled()
    expect(
      (
        await s.client.callTool({
          name: 'db_delete',
          arguments: { project: 'app', confirmName: 'app-db' },
        })
      ).structuredContent,
    ).toEqual({ database: null })
  } finally {
    await s.close()
  }
})
it('必要な値がnull・省略なら対象を示したエラーを返す', async () => {
  api.use(
    http.post(`${path}/exports`, () => HttpResponse.json({ exportJob: null })),
    http.get(`${path}/exports/exp_1`, () => HttpResponse.json({ exportJob: null })),
    http.post(`${path}/exports/exp_1/download`, () => HttpResponse.json({ download: null })),
    http.post(`${path}/auth-tokens`, () => HttpResponse.json({ authToken: null })),
  )
  const s = await connect()
  try {
    for (const [name, label] of [
      ['db_create_export', 'エクスポートジョブ'],
      ['db_get_export', 'エクスポートジョブ'],
      ['db_get_export_download', 'ダウンロード情報'],
      ['db_create_token', '接続トークン'],
    ]) {
      const result = await s.client.callTool({
        name: name!,
        arguments: { project: 'app', exportJobId: 'exp_1' },
      })
      expect(result.isError).toBe(true)
      expect(result.structuredContent).toBeUndefined()
      expect(JSON.stringify(result)).toContain(label)
    }
  } finally {
    await s.close()
  }
})
it('SQLiteを分割PUTしてETagを取込開始に渡す。失敗・ETag欠落・nullでは開始しない', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hanamii-db-'))
  const file = join(dir, 'backup.db')
  const data = Buffer.from('SQLite format 3\0data')
  await writeFile(file, data)
  let mode = 'ok'
  const start = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({
      sessionId: 'session_1',
      parts: [
        { partNumber: 1, etag: '"one"' },
        { partNumber: 2, etag: '"two"' },
      ],
      name: 'restored',
    })
    return HttpResponse.json({ database: { ...db, status: 'importing' } })
  })
  api.use(
    http.post(`${path}/import-session`, async ({ request }) => {
      expect(await request.json()).toEqual({ fileSizeBytes: data.length })
      return HttpResponse.json({
        session:
          mode === 'null'
            ? null
            : {
                sessionId: 'session_1',
                partSizeBytes: 16,
                parts: [
                  { partNumber: 1, url: 'https://storage.test/1', contentLength: 16 },
                  { partNumber: 2, url: 'https://storage.test/2', contentLength: 4 },
                ],
                expiresAt: null,
              },
      })
    }),
    http.put('https://storage.test/:part', async ({ request, params }) => {
      expect(request.headers.has('authorization')).toBe(false)
      const first = params.part === '1'
      expect(Buffer.from(await request.arrayBuffer())).toEqual(
        first ? data.subarray(0, 16) : data.subarray(16),
      )
      expect(request.headers.get('content-length')).toBe(first ? '16' : '4')
      return new HttpResponse(null, {
        status: mode === 'fail' ? 403 : 200,
        headers: mode === 'missing' ? {} : { ETag: first ? '"one"' : '"two"' },
      })
    }),
    http.post(`${path}/import-start`, start),
  )
  const s = await connect()
  try {
    const call = () =>
      s.client.callTool({
        name: 'db_import',
        arguments: { project: 'app', file, name: 'restored' },
      })
    expect((await call()).structuredContent).toEqual({ database: { ...db, status: 'importing' } })
    for (mode of ['null', 'missing', 'fail']) expect((await call()).isError).toBe(true)
    await writeFile(file, 'not sqlite')
    expect((await call()).isError).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
  } finally {
    await s.close()
    await rm(dir, { recursive: true, force: true })
  }
})
