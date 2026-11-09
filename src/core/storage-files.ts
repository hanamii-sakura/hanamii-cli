import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import type { HanamiiClient } from '../api/client.js'
import { redact } from '../api/errors.js'
import {
  createStorageFileClient,
  putStorageFile,
  storageOrigin,
  storageFileId,
  StorageFileApiError,
} from '../api/storage-files.js'
import { OperationError } from './errors.js'
import { requireWorkspace, resolveBucket } from './storage.js'

export interface StorageFileOptions {
  bucket: string
  workspaceId?: string
  fetch?: typeof fetch
}
export interface StorageFileWarning {
  keyId?: string
  fileId?: string
  message: string
}
const mime: Record<string, string> = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
  '.csv': 'text/csv',
}
function textField(value: string, label: string) {
  if (!value.length || value.length > 255 || /[\r\n]/.test(value))
    throw new OperationError(`${label}は改行なしの1〜255文字で指定してください`, 2)
  return value
}
async function target(client: HanamiiClient, options: StorageFileOptions) {
  const workspaceId = await requireWorkspace(client, options.workspaceId)
  const { bucket, apiOrigin } = await resolveBucket(client, workspaceId, options.bucket)
  storageOrigin(apiOrigin)
  return { workspaceId, bucketId: bucket.id, apiOrigin }
}
type Target = Awaited<ReturnType<typeof target>>
async function temporaryKey<T extends object>(
  client: HanamiiClient,
  selected: Target,
  options: StorageFileOptions,
  action: (
    api: ReturnType<typeof createStorageFileClient>,
    warnings: StorageFileWarning[],
  ) => Promise<T>,
) {
  const issued = await client.createStorageAccessKey(
    selected.workspaceId,
    selected.bucketId,
    'read_write',
    { retryRateLimit: false },
  )
  const warnings: StorageFileWarning[] = []
  let result: T | undefined
  let failure: unknown
  try {
    if (!issued.key) throw new Error('一時アクセスキーを取得できませんでした')
    result = await action(
      createStorageFileClient(selected.apiOrigin, issued.key, options.fetch),
      warnings,
    )
  } catch (error) {
    failure = error
  } finally {
    try {
      await client.revokeStorageAccessKey(selected.workspaceId, selected.bucketId, issued.keyId)
    } catch {
      warnings.push({
        keyId: issued.keyId,
        message: `一時キー ${issued.keyId} の無効化に失敗しました。storage keys revoke で無効化してください`,
      })
    }
  }
  const safeWarnings = JSON.parse(
    redact(JSON.stringify(warnings), issued.key),
  ) as StorageFileWarning[]
  if (failure) {
    const message = failure instanceof Error ? failure.message : 'ファイル操作に失敗しました'
    throw new OperationError(
      redact([message, ...safeWarnings.map((w) => w.message)].join('\n'), issued.key),
      failure instanceof OperationError ? failure.exitCode : 1,
      {
        ...(failure instanceof OperationError && failure.details
          ? (failure.details as object)
          : {}),
        warnings: safeWarnings,
      },
    )
  }
  return JSON.parse(
    redact(JSON.stringify({ ...result, warnings: safeWarnings }), issued.key),
  ) as T & { warnings: StorageFileWarning[] }
}
export async function uploadStorageFile(
  client: HanamiiClient,
  options: StorageFileOptions & {
    path: string
    name?: string
    contentType?: string
    completeAttempts?: number
    retryDelayMs?: number
    sleep?: (ms: number) => Promise<void>
  },
) {
  const name = textField(options.name ?? basename(options.path), '保存名')
  const contentType = textField(
    options.contentType ?? mime[extname(options.path).toLowerCase()] ?? 'application/octet-stream',
    'contentType',
  )
  const attempts = options.completeAttempts ?? 10
  const interval = options.retryDelayMs ?? 3000
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 1 ||
    attempts > 100 ||
    !Number.isSafeInteger(interval) ||
    interval < 0 ||
    interval > 60_000
  )
    throw new OperationError('完了待機の設定が不正です', 2)
  const file = await open(options.path, 'r').catch(() => {
    throw new OperationError(
      'アップロードするファイルを開けません。パスと読み取り権限を確認してください',
      2,
    )
  })
  try {
    const stat = await file.stat()
    if (!stat.isFile())
      throw new OperationError('ディレクトリではなく通常のファイルを指定してください', 2)
    if (stat.size === 0 || stat.size > 2_000_000_000)
      throw new OperationError(
        'ファイルサイズは1バイト以上2GB（2,000,000,000バイト）以下で指定してください',
        2,
      )
    const hash = createHash('md5')
    for await (const chunk of file.createReadStream({
      start: 0,
      end: stat.size - 1,
      autoClose: false,
    }))
      hash.update(chunk)
    const after = await file.stat()
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs)
      throw new Error('MD5計算中にファイルが変更されました')
    const input = {
      name,
      contentType,
      sizeBytes: String(stat.size),
      contentMd5: hash.digest('base64'),
    }
    const selected = await target(client, options)
    return await temporaryKey(client, selected, options, async (api, warnings) => {
      const upload = await api.createUpload(input).catch((error) => {
        if (error instanceof StorageFileApiError && error.status === 409)
          throw new Error(
            `${error.message}\n同名ファイルが存在します。置き換える場合は先に既存ファイルを削除してください（自動上書きはしません）`,
          )
        throw error
      })
      let pending = false
      try {
        await putStorageFile(upload, file, input)
        for (let i = 0; i < attempts; i++) {
          try {
            await api.complete(upload.fileId)
            return {
              bucketId: selected.bucketId,
              fileId: upload.fileId,
              name,
              sizeBytes: input.sizeBytes,
              contentType,
              uploaded: true,
            }
          } catch (error) {
            if (!(error instanceof StorageFileApiError && error.status === 409)) throw error
            if (i + 1 < attempts) await (options.sleep ?? delay)(interval)
          }
        }
        pending = true
        throw new OperationError(
          `完了の確認が時間内に終わりませんでした（fileId: ${upload.fileId}）。取り消していません`,
          11,
          { fileId: upload.fileId },
        )
      } catch (error) {
        if (!pending) {
          try {
            await api.deleteFile(upload.fileId)
          } catch {
            warnings.push({
              fileId: upload.fileId,
              message: `アップロード ${upload.fileId} の取り消しに失敗しました`,
            })
          }
        }
        throw error
      }
    })
  } finally {
    await file.close()
  }
}
export async function findStorageFile(
  client: HanamiiClient,
  workspaceId: string,
  bucketId: string,
  fileId: string,
) {
  storageFileId(fileId)
  const seen = new Set<string>()
  let cursor: string | undefined
  for (;;) {
    const page = await client.listStorageFiles(workspaceId, bucketId, cursor)
    const file = page.items.find((item) => item.id === fileId)
    if (file) return file
    if (!page.nextCursor) throw new Error('削除対象のファイルが見つかりません')
    if (seen.has(page.nextCursor)) throw new Error('ファイル一覧のカーソルが循環しています')
    seen.add(page.nextCursor)
    cursor = page.nextCursor
  }
}
export async function deleteStorageFile(
  client: HanamiiClient,
  options: StorageFileOptions & { fileId: string; confirm: (name: string) => Promise<boolean> },
) {
  storageFileId(options.fileId)
  const selected = await target(client, options)
  const file = await findStorageFile(
    client,
    selected.workspaceId,
    selected.bucketId,
    options.fileId,
  )
  if (!(await options.confirm(file.name)))
    throw new OperationError('ファイル名が一致しないため削除を中止しました', 1)
  return temporaryKey(client, selected, options, async (api) => {
    await api.deleteFile(file.id)
    return { bucketId: selected.bucketId, fileId: file.id, name: file.name, deleted: true }
  })
}
