import { createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ZipFile } from 'yazl'
import { walk, type WalkOptions, type WalkResult } from './walk.js'
import { PrecheckError } from './precheck.js'

/** 呼び出し側は finally で cleanup を呼ぶ。作成失敗時はここで削除する。 */
export async function buildZip(dir: string, options: WalkOptions = {}, listing?: WalkResult) {
  const source = listing ?? (await walk(dir, options))
  if (!source.files.length) throw new PrecheckError('ZIPファイルが空です')
  const temporary = await mkdtemp(join(tmpdir(), 'hanamii-zip-'))
  const zipPath = join(temporary, 'app.zip')
  const cleanup = () => rm(temporary, { recursive: true, force: true })
  const zip = new ZipFile()
  zip.on('error', (error: Error) => (zip.outputStream as Readable).destroy(error))
  try {
    const writing = pipeline(zip.outputStream, createWriteStream(zipPath, { mode: 0o600 }))
    try {
      for (const file of source.files) zip.addFile(join(source.dir, file), file)
      zip.end()
    } catch (error) {
      ;(zip.outputStream as Readable).destroy(error as Error)
    }
    await writing
    return {
      zipPath,
      fileCount: source.files.length,
      bytes: (await stat(zipPath)).size,
      skipped: source.skipped,
      cleanup,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}
