import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { base, connect } from './helpers.js'

const storage = `${base}/workspaces/ws_1/storage`
const bucket = {
  id: 'bkt_1',
  name: 'uploads',
  visibility: 'private',
  createdAt: '2026-11-01T00:00:00.000Z',
}
const apiOrigin = 'https://storage.test'
const fullToken = {
  token: { id: 'tok_1', name: 'mcp', scopeType: 'full_account', scopeWorkspaceId: null },
}
const api = setupServer()
const bucketList = vi.fn((_cursor: string | null) => ({
  items: [bucket],
  nextCursor: null as string | null,
  apiOrigin,
}))
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  api.resetHandlers()
  vi.restoreAllMocks()
  bucketList.mockClear()
})
afterAll(() => api.close())
/** ワークスペースが 1 つのトークンと、バケット 1 個を返す既定の応答 */
function useDefaults() {
  api.use(
    http.get(`${base}/user/tokens/current`, () => HttpResponse.json(fullToken)),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({ workspaces: [{ id: 'ws_1', name: 'team', role: 'owner' }] }),
    ),
    http.get(`${storage}/buckets`, ({ request }) =>
      HttpResponse.json(bucketList(new URL(request.url).searchParams.get('cursor'))),
    ),
  )
}
const call = async (
  session: Awaited<ReturnType<typeof connect>>,
  name: string,
  args: Record<string, unknown> = {},
) => session.client.callTool({ name, arguments: args })

it('読取4ツールはワークスペースとバケット名を解決し、API の応答を保持する', async () => {
  useDefaults()
  const keys = {
    items: [{ keyId: 'key_1', permission: 'read_only', creatorEmail: null, lastUsedAt: null }],
    nextCursor: null,
  }
  const files = {
    items: [{ id: 'file_1', name: 'a.png', sizeBytes: '12', contentType: 'image/png' }],
    nextCursor: 'c2',
  }
  const usage = {
    usedBytes: '12',
    fileCount: '1',
    deliveredBytes: '0',
    limits: { maxBuckets: '1', maxTotalBytes: '1000000000', maxFiles: '1000', maxFileBytes: '5' },
  }
  const fileCursors: (string | null)[] = []
  api.use(
    http.get(`${storage}/buckets/bkt_1/access-keys`, () => HttpResponse.json(keys)),
    http.get(`${storage}/buckets/bkt_1/files`, ({ request }) => {
      fileCursors.push(new URL(request.url).searchParams.get('cursor'))
      return HttpResponse.json(files)
    }),
    http.get(`${storage}/usage`, () => HttpResponse.json(usage)),
  )
  const s = await connect()
  try {
    const tools = (await s.client.listTools()).tools
    expect(
      tools
        .filter((t) => t.name.startsWith('storage_') && t.annotations?.readOnlyHint)
        .map((t) => t.name)
        .sort(),
    ).toEqual([
      'storage_get_usage',
      'storage_list_access_keys',
      'storage_list_buckets',
      'storage_list_files',
    ])
    expect((await call(s, 'storage_list_buckets')).structuredContent).toEqual({
      workspaceId: 'ws_1',
      items: [bucket],
      nextCursor: null,
      apiOrigin,
    })
    // 名前でも ID でも同じバケットに届く
    expect(
      (await call(s, 'storage_list_access_keys', { bucket: 'uploads' })).structuredContent,
    ).toEqual({ bucketId: 'bkt_1', ...keys })
    expect(
      (await call(s, 'storage_list_files', { bucket: 'bkt_1', cursor: 'c1' })).structuredContent,
    ).toEqual({ bucketId: 'bkt_1', ...files })
    expect(fileCursors).toEqual(['c1'])
    expect((await call(s, 'storage_get_usage')).structuredContent).toEqual({
      workspaceId: 'ws_1',
      ...usage,
    })
    const missing = await call(s, 'storage_list_files', { bucket: 'nothing' })
    expect(missing.isError).toBe(true)
    expect(JSON.stringify(missing)).toContain('バケットが見つかりません')
  } finally {
    await s.close()
  }
})

it('workspaceId の指定・ワークスペース限定トークン・複数ワークスペースを扱う', async () => {
  const seen: string[] = []
  api.use(
    http.get(`${base}/workspaces/:ws/storage/usage`, ({ params }) => {
      seen.push(String(params.ws))
      return HttpResponse.json({
        usedBytes: '0',
        fileCount: '0',
        deliveredBytes: '0',
        limits: null,
      })
    }),
  )
  const s = await connect()
  try {
    // 指定があればトークンやワークスペース一覧を問い合わせない
    expect((await call(s, 'storage_get_usage', { workspaceId: 'ws_9' })).isError).not.toBe(true)
    api.use(
      http.get(`${base}/user/tokens/current`, () =>
        HttpResponse.json({
          token: { id: 'tok_2', scopeType: 'workspace', scopeWorkspaceId: 'ws_scoped' },
        }),
      ),
    )
    expect((await call(s, 'storage_get_usage')).structuredContent).toMatchObject({
      workspaceId: 'ws_scoped',
    })
    expect(seen).toEqual(['ws_9', 'ws_scoped'])
    api.use(
      http.get(`${base}/user/tokens/current`, () => HttpResponse.json(fullToken)),
      http.get(`${base}/workspaces`, () =>
        HttpResponse.json({
          workspaces: [
            { id: 'ws_1', name: 'a', role: 'owner' },
            { id: 'ws_2', name: 'b', role: 'member' },
          ],
        }),
      ),
    )
    const ambiguous = await call(s, 'storage_get_usage')
    expect(ambiguous.isError).toBe(true)
    expect(JSON.stringify(ambiguous)).toContain('ws_2')
    expect(seen).toHaveLength(2)
  } finally {
    await s.close()
  }
})

it('バケット作成・キー発行・無効化・閲覧URL を API に正しく送る', async () => {
  useDefaults()
  const bodies: unknown[] = []
  const revoked = vi.fn(() => new HttpResponse(null, { status: 204 }))
  api.use(
    http.post(`${storage}/buckets`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ ...bucket, id: 'bkt_2', name: 'public-img' }, { status: 201 })
    }),
    http.post(`${storage}/buckets/bkt_1/access-keys`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(
        { keyId: 'key_1', permission: 'read_write', createdAt: 'now', key: 'hst_key_1.secret' },
        { status: 201 },
      )
    }),
    http.delete(`${storage}/buckets/bkt_1/access-keys/key_AbCdEfGhIjKlMnOpQrStUvWx`, revoked),
    http.post(`${storage}/buckets/bkt_1/files/file_1/view-url`, () =>
      HttpResponse.json({ url: 'https://files.test/a.png?sig=1', expiresAt: 'later' }),
    ),
  )
  const s = await connect()
  try {
    expect(
      (await call(s, 'storage_create_bucket', { name: 'public-img', visibility: 'public' }))
        .structuredContent,
    ).toMatchObject({ workspaceId: 'ws_1', id: 'bkt_2', name: 'public-img' })
    // 鍵は発行時の応答でだけ返し、接続先も一緒に渡す
    const issued = await call(s, 'storage_create_access_key', {
      bucket: 'uploads',
      permission: 'read_write',
    })
    expect(issued.structuredContent).toEqual({
      bucketId: 'bkt_1',
      keyId: 'key_1',
      permission: 'read_write',
      createdAt: 'now',
      key: 'hst_key_1.secret',
      apiOrigin,
    })
    expect(bodies).toEqual([
      { name: 'public-img', visibility: 'public' },
      { permission: 'read_write' },
    ])
    expect(
      (
        await call(s, 'storage_revoke_access_key', {
          bucket: 'uploads',
          keyId: 'key_AbCdEfGhIjKlMnOpQrStUvWx',
        })
      ).structuredContent,
    ).toEqual({ bucketId: 'bkt_1', keyId: 'key_AbCdEfGhIjKlMnOpQrStUvWx', revoked: true })
    expect(revoked).toHaveBeenCalledTimes(1)
    expect(
      (await call(s, 'storage_get_file_url', { bucket: 'uploads', fileId: 'file_1' }))
        .structuredContent,
    ).toEqual({ url: 'https://files.test/a.png?sig=1', expiresAt: 'later' })
    // 入力の形が違えば API を呼ばない
    for (const [name, args] of [
      ['storage_create_bucket', { name: 'Bad Name', visibility: 'private' }],
      ['storage_create_bucket', { name: 'ok-name', visibility: 'secret' }],
      ['storage_create_access_key', { bucket: 'uploads', permission: 'admin' }],
      ['storage_revoke_access_key', { bucket: 'uploads', keyId: 'hst_key_1.secret' }],
      ['storage_get_file_url', { bucket: 'uploads', fileId: '../x' }],
    ] as const)
      expect((await call(s, name, args)).isError, name).toBe(true)
    expect(bodies).toHaveLength(2)
    expect(revoked).toHaveBeenCalledTimes(1)
  } finally {
    await s.close()
  }
})

it('バケット削除は opt-in のみ登録し、確認名が違えば DELETE しない', async () => {
  useDefaults()
  const normal = await connect()
  try {
    expect((await normal.client.listTools()).tools.map((t) => t.name)).not.toContain(
      'storage_delete_bucket',
    )
  } finally {
    await normal.close()
  }
  let status = 202
  const deleted = vi.fn(() =>
    status === 202
      ? HttpResponse.json({ status: 'processing' }, { status })
      : new HttpResponse(null, { status }),
  )
  api.use(http.delete(`${storage}/buckets/bkt_1`, deleted))
  const s = await connect({ allowDelete: true })
  try {
    expect(
      (await s.client.listTools()).tools.find((t) => t.name === 'storage_delete_bucket')
        ?.annotations,
    ).toMatchObject({ destructiveHint: true, readOnlyHint: false })
    expect(
      (await call(s, 'storage_delete_bucket', { bucket: 'uploads', confirmName: 'bkt_1' })).isError,
    ).toBe(true)
    expect(deleted).not.toHaveBeenCalled()
    expect(
      (await call(s, 'storage_delete_bucket', { bucket: 'bkt_1', confirmName: 'uploads' }))
        .structuredContent,
    ).toEqual({ bucketId: 'bkt_1', name: 'uploads', status: 'processing' })
    status = 204
    expect(
      (await call(s, 'storage_delete_bucket', { bucket: 'uploads', confirmName: 'uploads' }))
        .structuredContent,
    ).toEqual({ bucketId: 'bkt_1', name: 'uploads', status: 'completed' })
    expect(deleted).toHaveBeenCalledTimes(2)
  } finally {
    await s.close()
  }
})

it('バケット名の解決は全ページを見る。権限エラーではトークンを伏せる', async () => {
  useDefaults()
  bucketList.mockImplementation((cursor) =>
    cursor === null
      ? { items: [{ ...bucket, id: 'bkt_0', name: 'first' }], nextCursor: 'p2', apiOrigin }
      : { items: [bucket], nextCursor: null, apiOrigin },
  )
  api.use(
    http.get(`${storage}/buckets/bkt_1/access-keys`, () =>
      HttpResponse.json(
        { error: { code: 'forbidden', message: 'denied hnm_mcp_test' } },
        { status: 403 },
      ),
    ),
  )
  const s = await connect()
  try {
    const denied = await call(s, 'storage_list_access_keys', { bucket: 'uploads' })
    expect(bucketList.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'p2'])
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied)).toContain('[REDACTED]')
    expect(JSON.stringify(denied)).not.toContain('hnm_')
  } finally {
    await s.close()
  }
})
