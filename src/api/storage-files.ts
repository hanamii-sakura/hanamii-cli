import https from 'node:https'
import type { FileHandle } from 'node:fs/promises'
import { redact } from './errors.js'

export class StorageFileApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(redact(`${message}${requestId ? ` (requestId: ${requestId})` : ''}`))
  }
}
export interface StorageUploadInput {
  name: string
  sizeBytes: string
  contentType: string
  contentMd5: string
}
export interface StorageUpload {
  fileId: string
  uploadUrl: string
  headers: Record<string, string>
}
export function storageOrigin(value: string): string {
  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('ストレージ API の接続先が不正です')
  return url.origin
}
export function storageFileId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('ファイル ID が不正です')
  return value
}
export function createStorageFileClient(
  apiOrigin: string,
  key: string,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const origin = storageOrigin(apiOrigin)
  async function request(
    path: string,
    method: string,
    body?: StorageUploadInput,
  ): Promise<unknown> {
    let response: Response
    let text: string
    try {
      response = await fetcher(`${origin}/v1/files${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${key}`,
          ...(body
            ? { 'Content-Type': 'application/json' }
            : method === 'POST'
              ? { 'Content-Length': '0' }
              : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
      text = await response.text()
    } catch {
      throw new Error('ストレージのファイル API に接続できませんでした')
    }
    let data: unknown = {}
    if (text.trim()) {
      try {
        const start = text.indexOf('{')
        if (start < 0) throw new Error()
        data = JSON.parse(text.slice(start)) as unknown
      } catch {
        throw new StorageFileApiError(
          response.status,
          'INVALID_RESPONSE',
          'ファイル API の JSON 応答が不正です',
        )
      }
    }
    if (data && typeof data === 'object' && 'error' in data) {
      const error = data.error as Record<string, unknown> | null
      throw new StorageFileApiError(
        response.status,
        redact(typeof error?.code === 'string' ? error.code : 'UNKNOWN', key),
        redact(
          typeof error?.message === 'string' ? error.message : 'ファイル API がエラーを返しました',
          key,
        ),
        typeof error?.requestId === 'string' ? redact(error.requestId, key) : undefined,
      )
    }
    if (!response.ok)
      throw new StorageFileApiError(
        response.status,
        'HTTP_ERROR',
        `ファイル API: HTTP ${response.status}`,
      )
    return data
  }
  return {
    async createUpload(body: StorageUploadInput): Promise<StorageUpload> {
      const value = (await request('/uploads', 'POST', body)) as StorageUpload | null
      if (!value || typeof value.fileId !== 'string')
        throw new Error('アップロード用の fileId を取得できませんでした')
      storageFileId(value.fileId)
      return value
    },
    complete: (fileId: string) => request(`/${storageFileId(fileId)}/complete`, 'POST'),
    deleteFile: async (fileId: string) => {
      await request(`/${storageFileId(fileId)}`, 'DELETE')
    },
  }
}

/** fetchの禁止ヘッダー処理を介さず、署名された値をそのまま送る。 */
export async function putStorageFile(
  upload: StorageUpload,
  file: FileHandle,
  input: StorageUploadInput,
): Promise<void> {
  const url = new URL(upload.uploadUrl)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('アップロード URL が不正です')
  if (!upload.headers || typeof upload.headers !== 'object')
    throw new Error('アップロード用ヘッダーがありません')
  const entries = Object.entries(upload.headers)
  const headers = Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]))
  const expected = ['content-type', 'content-length', 'content-disposition', 'content-md5']
  if (
    entries.length !== 4 ||
    expected.some((k) => typeof headers[k] !== 'string') ||
    entries.some(([k]) => !expected.includes(k.toLowerCase())) ||
    headers['content-length'] !== input.sizeBytes ||
    headers['content-md5'] !== input.contentMd5 ||
    headers['content-type'] !== input.contentType
  )
    throw new Error('署名済みアップロードヘッダーが要求内容と一致しません')
  await new Promise<void>((resolve, reject) => {
    const request = https.request(url, { method: 'PUT', headers: upload.headers })
    const source = file.createReadStream({
      start: 0,
      end: Number(input.sizeBytes) - 1,
      autoClose: false,
    })
    let settled = false
    let sent = 0
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      source.destroy()
      request.destroy()
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(
      () => finish(new Error('ファイルの PUT がタイムアウトしました')),
      15 * 60_000,
    )
    request.on('error', () => finish(new Error('ファイルの PUT に失敗しました')))
    source.on('error', () => finish(new Error('アップロード中にファイルを読み込めませんでした')))
    source.on('data', (chunk) => {
      sent += chunk.length
    })
    source.on('end', () => {
      if (sent !== Number(input.sizeBytes))
        finish(new Error('アップロード中にファイルサイズが変わりました'))
    })
    request.on('response', (response) => {
      response.on('error', () => finish(new Error('PUT 応答が中断されました')))
      response.on('end', () =>
        finish(
          response.statusCode && response.statusCode >= 200 && response.statusCode < 300
            ? undefined
            : new Error(`ファイルの PUT に失敗しました（HTTP ${response.statusCode ?? 0}）`),
        ),
      )
      response.resume()
    })
    source.pipe(request)
  })
}
