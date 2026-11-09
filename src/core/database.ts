import { open } from 'node:fs/promises'
import type { HanamiiClient } from '../api/client.js'
import { OperationError } from './errors.js'

export function requiredValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined || value === '')
    throw new Error(`${label} を取得できませんでした`)
  return value
}

/** API が発行した署名 URL にだけ、認証ヘッダーなしでパートを送る。 */
export async function importDatabase(
  client: HanamiiClient,
  id: string,
  file: string,
  name?: string,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size < 16 || stat.size > 100 * 1024 * 1024)
      throw new OperationError('SQLite ファイルは16バイト以上100MiB以下で指定してください', 2)
    const header = Buffer.alloc(16)
    await handle.read(header, 0, 16, 0)
    if (header.toString('utf8') !== 'SQLite format 3\0')
      throw new OperationError('SQLite ファイルのヘッダーが不正です', 2)
    const session = requiredValue(
      (await client.createDatabaseImportSession(id, stat.size, { retryRateLimit: false })).session,
      'インポート用アップロードセッション',
    )
    const parts = [...session.parts].sort((a, b) => a.partNumber - b.partNumber)
    if (
      !session.sessionId ||
      !Number.isSafeInteger(session.partSizeBytes) ||
      session.partSizeBytes <= 0 ||
      !parts.length ||
      parts.some(
        (p, i) =>
          p.partNumber !== i + 1 ||
          !Number.isSafeInteger(p.contentLength) ||
          p.contentLength <= 0 ||
          p.contentLength > session.partSizeBytes,
      ) ||
      parts.reduce((sum, p) => sum + p.contentLength, 0) !== stat.size
    )
      throw new Error('インポート用パートのサイズ・番号が不正です')
    // URL の妥当性はアップロード前にすべて確認する。リダイレクトは追わない。
    for (const part of parts) {
      const url = new URL(part.url)
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('インポート用アップロード URL が不正です')
    }
    const uploaded: { partNumber: number; etag: string }[] = []
    let offset = 0
    for (const part of parts) {
      const body = Buffer.alloc(part.contentLength)
      let read = 0
      while (read < body.length) {
        const { bytesRead } = await handle.read(body, read, body.length - read, offset + read)
        if (!bytesRead) throw new Error('SQLite ファイルがアップロード中に短くなりました')
        read += bytesRead
      }
      let response: Response
      try {
        response = await fetcher(part.url, {
          method: 'PUT',
          body,
          headers: { 'Content-Length': String(body.length) },
          redirect: 'error',
          signal: AbortSignal.timeout(60_000),
        })
      } catch {
        throw new Error(`DB インポートのパート ${part.partNumber} をアップロードできませんでした`)
      }
      await response.body?.cancel()
      if (!response.ok)
        throw new Error(`DB インポートのパート ${part.partNumber}: HTTP ${response.status}`)
      const etag = requiredValue(response.headers.get('etag'), `パート ${part.partNumber} の ETag`)
      uploaded.push({ partNumber: part.partNumber, etag })
      offset += body.length
    }
    const result = await client.startDatabaseImport(
      id,
      { sessionId: session.sessionId, parts: uploaded, ...(name === undefined ? {} : { name }) },
      { retryRateLimit: false },
    )
    requiredValue(result.database, 'インポート開始後のデータベース')
    return result
  } finally {
    await handle.close()
  }
}
