import type { Command } from 'commander'
import { resolveBaseUrl } from '../../config/resolve.js'
import { removeToken } from '../../config/store.js'
import type { CliContext, GlobalOptions } from '../context.js'

export function registerLogout(program: Command, context: CliContext): void {
  program
    .command('logout')
    .description('現在の接続先の保存済みトークンを削除する')
    .action(async (_options, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      const baseUrl = resolveBaseUrl(context.deps)
      await removeToken(baseUrl, context.deps)
      const environmentTokenActive = Boolean((context.deps.env ?? process.env).HANAMII_TOKEN)
      context.output.result(
        { loggedOut: true, baseUrl, environmentTokenActive },
        `保存済みトークンを削除しました。${environmentTokenActive ? '\nHANAMII_TOKEN は引き続き有効です。必要に応じて環境変数を解除してください。' : ''}`,
        Boolean(options.json),
      )
    })
}
