import { DEFAULT_BASE_URL, normalizeBaseUrl, type ConfigOptions } from './paths.js'
import { readConfig } from './store.js'

export interface ResolvedConfig {
  baseUrl: string
  token?: string
  source?: 'flag' | 'env' | 'config'
}

export function resolveBaseUrl(options: ConfigOptions = {}): string {
  return normalizeBaseUrl((options.env ?? process.env).HANAMII_BASE_URL || DEFAULT_BASE_URL)
}

export async function resolveConfig(
  options: ConfigOptions & { token?: string } = {},
): Promise<ResolvedConfig> {
  const baseUrl = resolveBaseUrl(options)
  if (options.token) return { baseUrl, token: options.token, source: 'flag' }
  const envToken = (options.env ?? process.env).HANAMII_TOKEN
  if (envToken) return { baseUrl, token: envToken, source: 'env' }
  const config = await readConfig(options)
  const token = config.tokens[baseUrl]
  return token ? { baseUrl, token, source: 'config' } : { baseUrl }
}
