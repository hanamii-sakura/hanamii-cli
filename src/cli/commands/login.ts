import type { Command } from 'commander'
import { AuthError } from '../../api/errors.js'
import { resolveBaseUrl } from '../../config/resolve.js'
import { saveToken } from '../../config/store.js'
import type { CliContext, GlobalOptions } from '../context.js'
import { UsageError } from '../output.js'

export function registerLogin(program: Command, context: CliContext): void {
  program
    .command('login')
    .description('トークンを検証して保存する（--token 指定時は対話を省略）')
    .option('--no-browser', 'ブラウザを開かない')
    .action(async (_options, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions & { browser: boolean }>()
      const baseUrl = resolveBaseUrl(context.deps)
      let token = options.token?.trim()
      if (options.token === undefined) {
        if (!context.isInteractive)
          throw new UsageError('非対話環境では login --token を指定してください')
        const url = `${baseUrl}/account/settings/tokens`
        context.output.error(`トークン発行ページ: ${url}\n`)
        if (options.browser) {
          try {
            await context.openBrowser(url)
          } catch {
            context.output.error('ブラウザを起動できませんでした。上記 URL を開いてください。\n')
          }
        }
        token = (await context.promptToken())?.trim()
        if (token === undefined) throw new Error('ログインを中断しました')
      }
      if (!token) throw new AuthError('トークンが空です')
      context.output.remember(token)
      await context.client(token, baseUrl).getCurrentToken()
      await saveToken(baseUrl, token, context.deps)
      context.output.result(
        { loggedIn: true, baseUrl },
        'ログインしました。',
        Boolean(options.json),
      )
    })
}
