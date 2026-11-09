import { setTimeout as delay } from 'node:timers/promises'
import { open, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { HanamiiClient } from '../api/client.js'
import type { DatabaseDownload, DatabaseExportJob } from '../api/types.js'
import { OperationError } from './errors.js'
import { requiredValue } from './database.js'

export async function waitDatabaseExport(
  client: HanamiiClient,
  id: string,
  initial: DatabaseExportJob,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs
  let job = initial
  while (job.status !== 'ready') {
    if (['failed', 'cancelled', 'expired'].includes(job.status))
      throw new OperationError(
        `DB エクスポート ${job.id}: ${job.status} (${job.failureCode ?? 'unknown'})`,
        1,
      )
    const remaining = deadline - Date.now()
    if (remaining <= 0)
      throw new OperationError(
        `DB エクスポート ${job.id} の待機がタイムアウトしました。--job で再開できます`,
        11,
      )
    await delay(Math.min(2000, remaining))
    if (Date.now() >= deadline)
      throw new OperationError(
        `DB エクスポート ${job.id} の待機がタイムアウトしました。--job で再開できます`,
        11,
      )
    job = requiredValue(
      (
        await client.getDatabaseExport(id, job.id, {
          signal: AbortSignal.timeout(deadline - Date.now()),
        })
      ).exportJob,
      'エクスポートジョブ',
    )
  }
  return job
}

/** 既存ファイルを上書きせず、ハッシュとサイズを検証して保存する。 */
export async function saveDatabaseExport(
  download: DatabaseDownload,
  file: string,
  fetcher: typeof fetch = globalThis.fetch,
) {
  const url = new URL(download.url)
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('DB エクスポート URL が不正です')
  const handle = await open(file, 'wx', 0o600)
  let complete = false
  try {
    let response: Response
    try {
      response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) })
    } catch {
      throw new Error('DB エクスポートをダウンロードできませんでした')
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error(`DB エクスポートのダウンロード: HTTP ${response.status}`)
    }
    const hash = createHash('sha256')
    const reader = response.body.getReader()
    let size = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.length
        if (size > download.sizeBytes) throw new Error('DB エクスポートのサイズが一致しません')
        hash.update(value)
        let written = 0
        while (written < value.length) {
          const result = await handle.write(value, written, value.length - written)
          if (!result.bytesWritten)
            throw new Error('DB エクスポートのファイルに書き込めませんでした')
          written += result.bytesWritten
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    if (size !== download.sizeBytes || hash.digest('hex') !== download.sha256)
      throw new Error('DB エクスポートのサイズまたは SHA-256 が一致しません')
    complete = true
  } finally {
    await handle.close()
    if (!complete) await unlink(file)
  }
}
