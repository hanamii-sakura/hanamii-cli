import type { Command } from 'commander'
import { startMcpServer } from '../../mcp/server.js'
import type { CliContext, GlobalOptions } from '../context.js'
export function registerMcp(program: Command, context: CliContext): void {
  program
    .command('mcp')
    .description('stdio MCP サーバーを起動')
    .option('--allow-delete', 'プロジェクト削除ツールを有効にする')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions & { allowDelete?: boolean }>()
      await startMcpServer({
        ...context.deps,
        ...(options.token ? { token: options.token } : {}),
        allowDelete: options.allowDelete ?? false,
      })
    })
}
