import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { main } from '../../src/cli.js'
const base = 'https://storage.test/api/v1'
const path = `${base}/workspaces/ws_1/storage`
const bucket = { id: 'bkt_1', name: 'uploads', visibility: 'private', createdAt: 'now' }
const api = setupServer()
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
afterEach(() => api.resetHandlers())
afterAll(() => api.close())
function session(interactive = false, answer = 'uploads') {
  let out = '',
    err = ''
  return {
    run: (...args: string[]) =>
      main(['node', 'hanamii', 'storage', ...args], {
        env: { HANAMII_TOKEN: 'hnm_test', HANAMII_BASE_URL: 'https://storage.test' },
        isInteractive: interactive,
        promptProjectName: async () => answer,
        stdout: (t) => {
          out += t
        },
        stderr: (t) => {
          err += t
        },
      }),
    output: () => out,
    error: () => err,
  }
}
function defaults() {
  api.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'workspace', scopeWorkspaceId: 'ws_1' } }),
    ),
    http.get(`${path}/buckets`, ({ request }) =>
      HttpResponse.json({
        items: new URL(request.url).searchParams.has('cursor') ? [bucket] : [],
        nextCursor: new URL(request.url).searchParams.has('cursor') ? null : 'next',
        apiOrigin: 'https://files.test',
      }),
    ),
  )
}
it('一覧・使用量・閲覧URLとカーソル、バケット名の全ページ解決', async () => {
  defaults()
  for (const [suffix, result] of [
    ['/buckets/bkt_1/access-keys', { items: [], nextCursor: 'more' }],
    [
      '/buckets/bkt_1/files',
      { items: [{ id: 'file_1', sizeBytes: '9007199254740993' }], nextCursor: null },
    ],
    ['/usage', { usedBytes: '9007199254740993' }],
  ] as const)
    api.use(
      http.get(`${path}${suffix}`, ({ request }) => {
        if (suffix !== '/usage')
          expect(new URL(request.url).searchParams.get('cursor')).toBe('page')
        return HttpResponse.json(result)
      }),
    )
  api.use(
    http.post(`${path}/buckets/bkt_1/files/file_1/view-url`, () =>
      HttpResponse.json({ url: 'https://files.test/a', expiresAt: null }),
    ),
  )
  for (const args of [
    ['buckets', 'list', '--cursor', 'next'],
    ['keys', 'list', 'uploads', '--cursor', 'page'],
    ['files', 'list', 'bkt_1', '--cursor', 'page'],
    ['files', 'url', 'uploads', 'file_1'],
    ['usage'],
  ]) {
    const s = session()
    expect(await s.run(...args, '--json')).toBe(0)
    expect(JSON.parse(s.output())).toBeTruthy()
  }
})
it('作成・キー発行・失効は正確な本文を送る。鍵は発行時だけ返す', async () => {
  defaults()
  const bodies: unknown[] = []
  api.use(
    http.post(`${path}/buckets`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(bucket)
    }),
    http.post(`${path}/buckets/bkt_1/access-keys`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({
        keyId: 'key_1',
        key: 'hst_secret',
        permission: 'read_only',
        createdAt: 'now',
        name: 'hnm_test',
      })
    }),
    http.delete(
      `${path}/buckets/bkt_1/access-keys/key_AbCdEfGhIjKlMnOpQrStUvWx`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  )
  expect(await session().run('buckets', 'create', 'uploads', '--visibility', 'private')).toBe(0)
  const s = session()
  expect(await s.run('keys', 'create', 'uploads', '--permission', 'read_only', '--json')).toBe(0)
  expect(JSON.parse(s.output())).toMatchObject({
    key: 'hst_secret',
    apiOrigin: 'https://files.test',
    name: '[REDACTED]',
  })
  expect(s.error()).toBe('')
  expect(await session().run('keys', 'revoke', 'uploads', 'key_AbCdEfGhIjKlMnOpQrStUvWx')).toBe(0)
  expect(bodies).toEqual([{ name: 'uploads', visibility: 'private' }, { permission: 'read_only' }])
  for (const args of [
    ['buckets', 'create', 'BAD', '--visibility', 'private'],
    ['keys', 'create', 'uploads', '--permission', 'admin'],
    ['keys', 'revoke', 'uploads', 'hst_secret'],
    ['files', 'url', 'uploads', '../bad'],
  ])
    expect(await session().run(...args)).toBe(2)
})
it('削除は確認必須、202/204を区別する', async () => {
  defaults()
  let processing = true
  const deleted = vi.fn(() =>
    processing
      ? HttpResponse.json({ status: 'processing' }, { status: 202 })
      : new HttpResponse(null, { status: 204 }),
  )
  api.use(http.delete(`${path}/buckets/bkt_1`, deleted))
  expect(await session().run('buckets', 'delete', 'uploads')).toBe(2)
  expect(await session(true, 'wrong').run('buckets', 'delete', 'uploads')).toBe(1)
  expect(deleted).not.toHaveBeenCalled()
  const first = session(true)
  expect(await first.run('buckets', 'delete', 'uploads', '--json')).toBe(0)
  expect(JSON.parse(first.output()).status).toBe('processing')
  processing = false
  const second = session()
  expect(await second.run('buckets', 'delete', 'uploads', '--yes', '--json')).toBe(0)
  expect(JSON.parse(second.output()).status).toBe('completed')
})
it('曖昧な workspace と権限エラーを扱い、トークンを伏せる', async () => {
  api.use(
    http.get(`${base}/user/tokens/current`, () =>
      HttpResponse.json({ token: { scopeType: 'full_account' } }),
    ),
    http.get(`${base}/workspaces`, () =>
      HttpResponse.json({ workspaces: [{ id: 'ws_a' }, { id: 'ws_b' }] }),
    ),
  )
  expect(await session().run('usage')).toBe(6)
  api.use(
    http.get(`${path}/usage`, () =>
      HttpResponse.json({ error: { code: 'forbidden', message: 'hnm_test' } }, { status: 403 }),
    ),
  )
  const s = session()
  expect(await s.run('usage', '--workspace', 'ws_1', '--json')).toBe(3)
  expect(s.error()).not.toContain('hnm_')
})
