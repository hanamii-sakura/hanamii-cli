import { createServer, type Server } from 'node:http'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { putZip } from '../../src/api/upload-put.js'
let dir: string
let file: string
let server: Server
let url: string
const payload = Buffer.alloc(180_000, 0x5a)
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hanamii-put-'))
  file = join(dir, 'app.zip')
  await writeFile(file, payload)
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('address')
  url = `http://127.0.0.1:${address.port}/signed?signature=private`
})
afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})
it('Content-Length と本文を送り Authorization/chunked を使わず進捗を通知', async () => {
  let body = Buffer.alloc(0)
  let headers: Record<string, unknown> = {}
  server.on('request', (request, response) => {
    headers = { ...request.headers, method: request.method, url: request.url }
    request.on('data', (chunk: Buffer) => {
      body = Buffer.concat([body, chunk])
    })
    request.on('end', () => {
      response.writeHead(200)
      response.end()
    })
  })
  const progress = vi.fn()
  await putZip(url, file, progress)
  expect(body).toEqual(payload)
  expect(headers).toMatchObject({
    method: 'PUT',
    url: '/signed?signature=private',
    'content-length': String(payload.length),
    'content-type': 'application/zip',
  })
  expect(headers.authorization).toBeUndefined()
  expect(headers['transfer-encoding']).toBeUndefined()
  expect(progress).toHaveBeenLastCalledWith(payload.length, payload.length)
})
it.each([302, 403, 500])('HTTP %s は再試行せず URL/応答本文をエラーに出さない', async (status) => {
  let count = 0
  server.on('request', (request, response) => {
    count++
    request.resume()
    response.writeHead(status, { Location: url })
    response.end('hnm_secret')
  })
  await expect(putZip(url, file)).rejects.toThrow(`HTTP ${status}`)
  expect(count).toBe(1)
})
it('タイムアウトと中断を分類する', async () => {
  server.on('request', (request) => request.resume())
  await expect(putZip(url, file, undefined, { timeoutMs: 20 })).rejects.toMatchObject({
    code: 'timeout',
  })
  const controller = new AbortController()
  const putting = putZip(url, file, () => controller.abort(), { signal: controller.signal })
  await expect(putting).rejects.toMatchObject({ code: 'aborted' })
  await expect(putZip(url, file, undefined, { signal: controller.signal })).rejects.toMatchObject({
    code: 'aborted',
  })
})
it('切断・ファイル欠落・不正URLを拒否する', async () => {
  server.on('request', (request) => request.socket.destroy())
  await expect(putZip(url, file)).rejects.toThrow('失敗')
  await expect(putZip(url, join(dir, 'absent'))).rejects.toThrow()
  await expect(putZip('file:///secret', file)).rejects.toThrow('URL')
})
