import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ConfigOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  home?: string
}

export function configPath(options: ConfigOptions = {}): string {
  const env = options.env ?? process.env
  const home = options.home ?? homedir()
  const root =
    (options.platform ?? process.platform) === 'win32'
      ? env.APPDATA || join(home, 'AppData', 'Roaming')
      : env.XDG_CONFIG_HOME || join(home, '.config')
  return join(root, 'hanamii', 'config.json')
}

export const DEFAULT_BASE_URL = 'https://hanamii.jp'

export function normalizeBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('接続先 URL が不正です')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('接続先は認証情報・クエリ・フラグメントを含まない HTTP(S) URL にしてください')
  }
  return url.href.replace(/\/+$/, '')
}
