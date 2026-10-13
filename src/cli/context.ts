import { spawn } from 'node:child_process'

import { createClient } from '../api/client.js'
import { AuthError } from '../api/errors.js'
import { type ConfigOptions } from '../config/paths.js'
import { resolveConfig } from '../config/resolve.js'
import { createOutput } from './output.js'

export interface GlobalOptions {
  token?: string
  workspace?: string
  json?: boolean
}
export interface CliDependencies extends ConfigOptions {
  fetch?: typeof globalThis.fetch
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  isInteractive?: boolean
  promptToken?: () => Promise<string | undefined>
  openBrowser?: (url: string) => Promise<void>
}

export function browserCommand(
  url: string,
  platform: NodeJS.Platform,
): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] }
  if (platform === 'win32') {
    // cmd の展開・メタ文字を含む URL は手動で開く案内へフォールバックする。
    if (/["%\r\n&|<>^]/.test(url)) throw new Error('ブラウザを自動起動できません')
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', `start "" "${url}"`] }
  }
  return { command: 'xdg-open', args: [url] }
}

export async function openBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const { command, args } = browserCommand(url, platform)
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: platform === 'win32',
    })
    child.once('error', () => reject(new Error('ブラウザを起動できません')))
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('ブラウザを起動できません')),
    )
  })
}

async function promptToken(): Promise<string | undefined> {
  const { password, isCancel } = await import('@clack/prompts')
  const result = await password({
    message: '発行したトークンを貼り付けてください',
    output: process.stderr,
  })
  return isCancel(result) ? undefined : result
}

export function createContext(deps: CliDependencies = {}) {
  const output = createOutput(
    deps.stdout ?? ((text) => process.stdout.write(text)),
    deps.stderr ?? ((text) => process.stderr.write(text)),
  )
  output.remember((deps.env ?? process.env).HANAMII_TOKEN)
  return {
    deps,
    output,
    isInteractive: deps.isInteractive ?? Boolean(process.stdin.isTTY && process.stderr.isTTY),
    promptToken: deps.promptToken ?? promptToken,
    openBrowser: deps.openBrowser ?? ((url: string) => openBrowser(url, deps.platform)),
    client: (token: string, baseUrl: string) => {
      output.remember(token)
      return createClient({ token, baseUrl, ...(deps.fetch ? { fetch: deps.fetch } : {}) })
    },
    async authenticated(options: GlobalOptions) {
      const resolved = await resolveConfig({
        ...deps,
        ...(options.token === undefined ? {} : { token: options.token }),
      })
      if (!resolved.token) throw new AuthError()
      output.remember(resolved.token)
      return {
        ...resolved,
        client: createClient({
          token: resolved.token,
          baseUrl: resolved.baseUrl,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
        }),
      }
    },
  }
}
export type CliContext = ReturnType<typeof createContext>
