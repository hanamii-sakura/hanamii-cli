import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { NetworkError } from './errors.js'

export interface PutOptions {
  signal?: AbortSignal
  timeoutMs?: number
}
/** 署名 URL は認証ヘッダーを付けず、リダイレクト・再試行もしない。 */
export async function putZip(
  uploadUrl: string,
  zipPath: string,
  onProgress?: (sent: number, total: number) => void,
  options: PutOptions = {},
): Promise<void> {
  let url: URL
  try {
    url = new URL(uploadUrl)
  } catch {
    throw new Error('アップロードURLが不正です')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('アップロードURLが不正です')
  const info = await stat(zipPath)
  if (!info.isFile()) throw new Error('ZIPファイルを指定してください')
  if (options.signal?.aborted) throw new NetworkError('アップロードを中断しました', 'aborted')
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(zipPath)
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip', 'Content-Length': info.size },
    })
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      source.destroy()
      request.destroy()
      if (error) reject(error)
      else resolve()
    }
    const abort = () => finish(new NetworkError('アップロードを中断しました', 'aborted'))
    const timer = setTimeout(
      () => finish(new NetworkError('アップロードがタイムアウトしました', 'timeout')),
      options.timeoutMs ?? 15 * 60_000,
    )
    options.signal?.addEventListener('abort', abort, { once: true })
    request.on('error', () => finish(new NetworkError('ZIPのアップロードに失敗しました')))
    source.on('error', () => finish(new NetworkError('ZIPファイルを読み込めません')))
    let sent = 0
    source.on('data', (chunk) => {
      sent += chunk.length
      try {
        onProgress?.(sent, info.size)
      } catch {
        finish(new Error('アップロード進捗通知に失敗しました'))
      }
    })
    request.on('response', (response) => {
      response.on('error', () => finish(new NetworkError('アップロード応答が中断されました')))
      response.on('end', () => {
        const status = response.statusCode ?? 0
        finish(
          status >= 200 && status < 300
            ? undefined
            : new Error(`ZIPのアップロードに失敗しました（HTTP ${status}）`),
        )
      })
      response.resume()
    })
    source.pipe(request)
  })
}
