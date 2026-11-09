import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { createClient } from '../../src/api/client.js'
import { createStorageFileClient } from '../../src/api/storage-files.js'
import { uploadStorageFile, deleteStorageFile } from '../../src/core/storage-files.js'
import { main } from '../../src/cli.js'
import { connect } from '../mcp/helpers.js'
import { format } from '../../src/mcp/format.js'
const base = 'https://mcp.test/api/v1/workspaces/ws_1/storage'
const fileApi = 'https://files.test/v1/files'
const keyId = 'key_AbCdEfGhIjKlMnOpQrStUvWx'
const secret = `hst_${keyId}.${'s'.repeat(43)}`
const bucket = { id: 'bkt_1', name: 'uploads', visibility: 'private', createdAt: 'now' }
const fileInfo = {
  id: 'file_1',
  name: 'photo.png',
  sizeBytes: '5',
  contentType: 'image/png',
  createdAt: 'now',
  updatedAt: 'now',
}
const client = createClient({ token: 'hnm_test', baseUrl: 'https://mcp.test' })
const api = setupServer()
let dir: string,
  path: string,
  order: string[],
  mode: string,
  completeCalls: number,
  revokeFails: boolean
const input = { bucket: 'uploads', workspaceId: 'ws_1' }
const body = Buffer.from('hello')
const md5 = createHash('md5').update(body).digest('base64')
beforeAll(() => api.listen({ onUnhandledRequest: 'error' }))
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-files-'))
  path = join(dir, 'photo.png')
  await writeFile(path, body)
  order = []
  mode = 'ok'
  completeCalls = 0
  revokeFails = false
  api.use(
    http.get(`${base}/buckets`, () =>
      HttpResponse.json({ items: [bucket], nextCursor: null, apiOrigin: 'https://files.test' }),
    ),
    http.get(`${base}/buckets/bkt_1/files`, ({ request }) =>
      HttpResponse.json(
        new URL(request.url).searchParams.has('cursor')
          ? { items: [fileInfo], nextCursor: null }
          : { items: [], nextCursor: 'page2' },
      ),
    ),
    http.post(`${base}/buckets/bkt_1/access-keys`, async ({ request }) => {
      order.push('issue')
      expect(await request.json()).toEqual({ permission: 'read_write' })
      return HttpResponse.json({ keyId, key: secret, permission: 'read_write', createdAt: 'now' })
    }),
    http.delete(`${base}/buckets/bkt_1/access-keys/${keyId}`, () => {
      order.push('revoke')
      return revokeFails
        ? HttpResponse.json({ error: { code: 'forbidden', message: secret } }, { status: 403 })
        : new HttpResponse(null, { status: 204 })
    }),
    http.post(`${fileApi}/uploads`, async ({ request }) => {
      order.push('uploads')
      expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
      expect(await request.json()).toEqual({
        name: 'photo.png',
        sizeBytes: '5',
        contentType: 'image/png',
        contentMd5: md5,
      })
      if (mode === 'conflict')
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: secret, requestId: 'req_1' } },
          { status: 409 },
        )
      return new HttpResponse(
        ' \n ' +
          JSON.stringify({
            fileId: 'file_1',
            uploadUrl: 'https://put.test/object?signature=private',
            headers: {
              'Content-Type': 'image/png',
              'Content-Length': '5',
              'Content-Disposition': 'attachment; filename="photo.png"',
              'Content-MD5': md5,
            },
            expiresAt: 'later',
          }),
      )
    }),
    http.put('https://put.test/object', async ({ request }) => {
      order.push('put')
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.headers.get('transfer-encoding')).toBeNull()
      expect(request.headers.get('content-length')).toBe('5')
      expect(request.headers.get('content-type')).toBe('image/png')
      expect(request.headers.get('content-disposition')).toBe('attachment; filename="photo.png"')
      expect(request.headers.get('content-md5')).toBe(md5)
      expect(Buffer.from(await request.arrayBuffer())).toEqual(body)
      return new HttpResponse(mode === 'put-fail' ? secret : null, {
        status: mode === 'put-fail' ? 403 : 200,
      })
    }),
    http.post(`${fileApi}/file_1/complete`, async ({ request }) => {
      order.push('complete')
      completeCalls++
      expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
      expect(request.headers.get('content-length')).toBe('0')
      expect(await request.text()).toBe('')
      if (mode === 'pending' || (mode === 'retry' && completeCalls === 1))
        return HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'processing' } },
          { status: 409 },
        )
      if (mode === 'complete-fail')
        return HttpResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: secret, requestId: 'req_2' } },
          { status: 500 },
        )
      return HttpResponse.json({ id: 'file_1', unexpectedSecret: secret })
    }),
    http.delete(`${fileApi}/file_1`, ({ request }) => {
      order.push('delete')
      expect(request.headers.get('authorization')).toBe(`Bearer ${secret}`)
      if (mode === 'delete-fail')
        return HttpResponse.json({ error: { code: 'FORBIDDEN', message: secret } }, { status: 403 })
      return new HttpResponse(null, { status: 204 })
    }),
  )
})
afterEach(async () => {
  api.resetHandlers()
  await rm(dir, { recursive: true, force: true })
})
afterAll(() => api.close())
const upload = () =>
  uploadStorageFile(client, { ...input, path, completeAttempts: 2, sleep: async () => undefined })
it('一時キー→uploads→署名ヘッダー付きストリームPUT→complete→無効化の順', async () => {
  expect(await upload()).toEqual({
    bucketId: 'bkt_1',
    fileId: 'file_1',
    name: 'photo.png',
    sizeBytes: '5',
    contentType: 'image/png',
    uploaded: true,
    warnings: [],
  })
  expect(order).toEqual(['issue', 'uploads', 'put', 'complete', 'revoke'])
})
it.each(['put-fail', 'complete-fail'])(
  '%sで取り消しとキー無効化を行い、秘密を出さない',
  async (value) => {
    mode = value
    const error = await upload().catch((e) => e as Error)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(secret)
    expect(order.slice(-2)).toEqual(['delete', 'revoke'])
  },
)
it('complete 409は間隔付きで再試行、成功したら取消しなし', async () => {
  mode = 'retry'
  const sleep = vi.fn(async () => undefined)
  expect((await uploadStorageFile(client, { ...input, path, sleep })).uploaded).toBe(true)
  expect(sleep).toHaveBeenCalledWith(3000)
  expect(order).toEqual(['issue', 'uploads', 'put', 'complete', 'complete', 'revoke'])
})
it('complete待ち期限はfileId付きで失敗し、取消さずキーだけ無効化', async () => {
  mode = 'pending'
  await expect(upload()).rejects.toMatchObject({
    exitCode: 11,
    details: { fileId: 'file_1' },
    message: expect.stringContaining('file_1'),
  })
  expect(order).toEqual(['issue', 'uploads', 'put', 'complete', 'complete', 'revoke'])
})
it('同名409は削除の案内を出して上書きしない', async () => {
  mode = 'conflict'
  await expect(upload()).rejects.toThrow('先に既存ファイルを削除')
  expect(order).toEqual(['issue', 'uploads', 'revoke'])
})
it('キー無効化失敗は成功結果のwarningsと失敗エラーの両方で伝える', async () => {
  revokeFails = true
  const result = await upload()
  expect(result.warnings).toEqual([{ keyId, message: expect.stringContaining(keyId) }])
  expect(JSON.stringify(result)).not.toContain(secret)
  mode = 'put-fail'
  await expect(upload()).rejects.toMatchObject({
    message: expect.stringContaining(keyId),
    details: { warnings: [{ keyId, message: expect.any(String) }] },
  })
})
it.each(['empty', 'missing', 'directory', 'large'])('%sをAPI呼出し前に拒否する', async (value) => {
  if (value === 'empty') await writeFile(path, '')
  if (value === 'missing') path = join(dir, 'absent')
  if (value === 'directory') path = dir
  if (value === 'large') await truncate(path, 2_000_000_001)
  await expect(upload()).rejects.toMatchObject({ exitCode: 2 })
  expect(order).toEqual([])
})
it('削除は全ページから名前を解決し、確認前にはキー発行も削除もしない', async () => {
  await expect(
    deleteStorageFile(client, { ...input, fileId: 'file_1', confirm: async () => false }),
  ).rejects.toThrow('ファイル名')
  expect(order).toEqual([])
  expect(
    await deleteStorageFile(client, {
      ...input,
      fileId: 'file_1',
      confirm: async (name) => name === 'photo.png',
    }),
  ).toMatchObject({ deleted: true, name: 'photo.png' })
  expect(order).toEqual(['issue', 'delete', 'revoke'])
})
it('CLI human/jsonとMCPの成功・失敗で秘密を出さず、警告を伝える', async () => {
  revokeFails = true
  for (const json of [false, true]) {
    let out = '',
      err = ''
    const code = await main(
      [
        'node',
        'hanamii',
        'storage',
        'files',
        'upload',
        'uploads',
        path,
        '--workspace',
        'ws_1',
        ...(json ? ['--json'] : []),
      ],
      {
        env: { HANAMII_TOKEN: 'hnm_test', HANAMII_BASE_URL: 'https://mcp.test' },
        stdout: (t) => {
          out += t
        },
        stderr: (t) => {
          err += t
        },
      },
    )
    expect(code).toBe(0)
    expect(out).toContain(keyId)
    expect(out + err).not.toContain(secret)
  }
  const s = await connect()
  try {
    const result = await s.client.callTool({
      name: 'storage_upload_file',
      arguments: { ...input, path },
    })
    expect(result.isError).not.toBe(true)
    expect(JSON.stringify(result)).toContain(keyId)
    expect(JSON.stringify(result)).not.toContain(secret)
    mode = 'put-fail'
    const failed = await s.client.callTool({
      name: 'storage_upload_file',
      arguments: { ...input, path },
    })
    expect(failed.isError).toBe(true)
    expect(JSON.stringify(failed)).toContain(keyId)
    expect(JSON.stringify(failed)).not.toContain(secret)
  } finally {
    await s.close()
  }
  expect(JSON.stringify(format({ key: secret }))).not.toContain(secret)
})
it('MCP削除はopt-in、confirmName一致必須。CLIは非対話でyes必須', async () => {
  const normal = await connect()
  expect((await normal.client.listTools()).tools.map((t) => t.name)).not.toContain(
    'storage_delete_file',
  )
  await normal.close()
  const s = await connect({ allowDelete: true })
  try {
    expect(
      (
        await s.client.callTool({
          name: 'storage_delete_file',
          arguments: { ...input, fileId: 'file_1', confirmName: 'wrong' },
        })
      ).isError,
    ).toBe(true)
    expect(order).toEqual([])
    expect(
      (
        await s.client.callTool({
          name: 'storage_delete_file',
          arguments: { ...input, fileId: 'file_1', confirmName: 'photo.png' },
        })
      ).structuredContent,
    ).toMatchObject({ deleted: true })
  } finally {
    await s.close()
  }
  const deps = {
    isInteractive: false,
    env: { HANAMII_TOKEN: 'hnm_test', HANAMII_BASE_URL: 'https://mcp.test' },
    stdout: () => undefined,
    stderr: () => undefined,
  }
  expect(
    await main(
      ['node', 'hanamii', 'storage', 'files', 'delete', 'uploads', 'file_1', '--workspace', 'ws_1'],
      deps,
    ),
  ).toBe(2)
  expect(
    await main(
      [
        'node',
        'hanamii',
        'storage',
        'files',
        'delete',
        'uploads',
        'file_1',
        '--workspace',
        'ws_1',
        '--yes',
      ],
      deps,
    ),
  ).toBe(0)
})
it('ファイルAPIは200+errorを拒否し、requestIdを保持、リダイレクトを追わない', async () => {
  api.use(
    http.post(
      `${fileApi}/file_1/complete`,
      () =>
        new HttpResponse(
          ' \n ' +
            JSON.stringify({
              error: { code: 'FORBIDDEN', message: secret, requestId: 'req_test' },
            }),
        ),
    ),
  )
  const fileClient = createStorageFileClient('https://files.test', secret)
  await expect(fileClient.complete('file_1')).rejects.toMatchObject({
    status: 200,
    code: 'FORBIDDEN',
    requestId: 'req_test',
    message: '[REDACTED] (requestId: req_test)',
  })
  api.use(
    http.post(
      `${fileApi}/file_1/complete`,
      () => new HttpResponse(null, { status: 307, headers: { location: 'https://evil.test/' } }),
    ),
  )
  await expect(fileClient.complete('file_1')).rejects.toThrow('接続できません')
})

it('取消しと無効化が両方失敗しても元の失敗と各警告を保持する', async () => {
  mode = 'put-fail'
  revokeFails = true
  api.use(
    http.delete(`${fileApi}/file_1`, () => {
      order.push('delete')
      return HttpResponse.json({ error: { code: 'FORBIDDEN', message: secret } }, { status: 403 })
    }),
  )
  const error = await upload().catch((e) => e as Error)
  expect(error).toMatchObject({
    details: {
      warnings: [
        { fileId: 'file_1', message: expect.stringContaining('取り消し') },
        { keyId, message: expect.stringContaining('無効化') },
      ],
    },
  })
  expect((error as Error).message).toContain('PUT')
  expect((error as Error).message).not.toContain(secret)
  expect(order).toEqual(['issue', 'uploads', 'put', 'delete', 'revoke'])
})
it('認証や長さの異なる署名ヘッダーをPUTせず、予約を取り消す', async () => {
  for (const headers of [
    {
      'Content-Type': 'image/png',
      'Content-Length': '6',
      'Content-Disposition': 'inline',
      'Content-MD5': md5,
    },
    {
      'Content-Type': 'image/png',
      'Content-Length': '5',
      'Content-Disposition': 'inline',
      'Content-MD5': md5,
      Authorization: `Bearer ${secret}`,
    },
  ]) {
    order = []
    api.use(
      http.post(`${fileApi}/uploads`, () => {
        order.push('uploads')
        return HttpResponse.json({
          fileId: 'file_1',
          uploadUrl: 'https://put.test/object',
          headers,
        })
      }),
    )
    await expect(upload()).rejects.toThrow('ヘッダー')
    expect(order).toEqual(['issue', 'uploads', 'delete', 'revoke'])
  }
})
it('不明な拡張子はoctet-stream、保存名とMIMEの明示指定も送る', async () => {
  path = join(dir, 'file.unknown')
  await writeFile(path, body)
  const bodies: unknown[] = []
  api.use(
    http.post(`${fileApi}/uploads`, async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json(
        { error: { code: 'LIMIT_EXCEEDED', message: 'quota' } },
        { status: 422 },
      )
    }),
  )
  await expect(upload()).rejects.toThrow('quota')
  await expect(
    uploadStorageFile(client, { ...input, path, name: 'saved.csv', contentType: 'text/csv' }),
  ).rejects.toThrow('quota')
  expect(bodies).toEqual([
    {
      name: 'file.unknown',
      contentType: 'application/octet-stream',
      sizeBytes: '5',
      contentMd5: md5,
    },
    { name: 'saved.csv', contentType: 'text/csv', sizeBytes: '5', contentMd5: md5 },
  ])
  order = []
  await expect(
    uploadStorageFile(client, { ...input, path, name: 'bad\nname' }),
  ).rejects.toMatchObject({ exitCode: 2 })
  expect(order).toEqual([])
})
it('CLIの失敗時もJSONに一時キーを含めず、無効化失敗を示す', async () => {
  mode = 'complete-fail'
  revokeFails = true
  let out = '',
    err = ''
  expect(
    await main(
      [
        'node',
        'hanamii',
        'storage',
        'files',
        'upload',
        'uploads',
        path,
        '--workspace',
        'ws_1',
        '--json',
      ],
      {
        env: { HANAMII_TOKEN: 'hnm_test', HANAMII_BASE_URL: 'https://mcp.test' },
        stdout: (t) => {
          out += t
        },
        stderr: (t) => {
          err += t
        },
      },
    ),
  ).toBe(1)
  expect(out).toBe('')
  expect(err).not.toContain(secret)
  expect(JSON.parse(err).error.details.warnings).toEqual([
    { keyId, message: expect.stringContaining(keyId) },
  ])
  expect(err).toContain('req_2')
})
