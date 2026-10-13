import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

import { configPath, normalizeBaseUrl, type ConfigOptions } from './paths.js'

export interface Config {
  tokens: Record<string, string>
}

export async function readConfig(options: ConfigOptions = {}): Promise<Config> {
  let text: string
  try {
    text = await readFile(configPath(options), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { tokens: {} }
    throw new Error('設定ファイルを読み込めません')
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || !('tokens' in parsed)) throw new Error()
    const tokens = parsed.tokens
    if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) throw new Error()
    if (!Object.values(tokens).every((token) => typeof token === 'string')) throw new Error()
    return { tokens: tokens as Record<string, string> }
  } catch {
    throw new Error('設定ファイルの形式が不正です')
  }
}

async function writeConfig(config: Config, options: ConfigOptions): Promise<void> {
  const path = configPath(options)
  const dir = dirname(path)
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700)
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } catch {
    throw new Error('設定ファイルを保存できません')
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

export async function saveToken(
  baseUrl: string,
  token: string,
  options: ConfigOptions = {},
): Promise<void> {
  const key = normalizeBaseUrl(baseUrl)
  const config = await readConfig(options)
  config.tokens[key] = token
  await writeConfig(config, options)
}

export async function removeToken(baseUrl: string, options: ConfigOptions = {}): Promise<void> {
  const key = normalizeBaseUrl(baseUrl)
  const config = await readConfig(options)
  if (!Object.hasOwn(config.tokens, key)) return
  delete config.tokens[key]
  await writeConfig(config, options)
}
