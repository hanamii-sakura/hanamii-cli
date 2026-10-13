import type { Command } from 'commander'
import type { CliContext, GlobalOptions } from '../context.js'

export function registerWhoami(program: Command, context: CliContext): void {
  program
    .command('whoami')
    .description('現在のトークンの名前・スコープ・期限・取得元を表示する')
    .action(async (_options, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      const { client, source } = await context.authenticated(options)
      const { token } = await client.getCurrentToken()
      const data = {
        name: token.name,
        scopeType: token.scopeType,
        scopeWorkspaceId: token.scopeWorkspaceId,
        expiresAt: token.expiresAt,
        source,
      }
      context.output.result(
        data,
        `名前: ${data.name}\nスコープ: ${data.scopeType}${data.scopeWorkspaceId ? ` (${data.scopeWorkspaceId})` : ''}\n有効期限: ${data.expiresAt === null ? 'なし' : new Date(data.expiresAt).toISOString()}\n取得元: ${data.source}`,
        Boolean(options.json),
      )
    })
}
