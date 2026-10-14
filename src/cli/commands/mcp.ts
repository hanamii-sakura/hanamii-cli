import { Option } from 'commander'
import {
  installClients,
  installSnippet,
  runInstall,
  type InstallClient,
} from '../../mcp/install.js'
import { resolveConfig } from '../../config/resolve.js'
import { OperationError } from '../../core/errors.js'
import type { Command } from 'commander'
import { startMcpServer } from '../../mcp/server.js'
import type { CliContext, GlobalOptions } from '../context.js'
export function registerMcp(program: Command, context: CliContext): void {
  const mcp = program
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
  mcp
    .command('install')
    .description('MCP クライアントの設定スニペットを表示')
    .addOption(
      new Option('--client <client>', '設定するクライアント')
        .choices(installClients)
        .makeOptionMandatory(),
    )
    .option('--run', 'Claude Code の登録コマンドを実行')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        GlobalOptions & { client: InstallClient; run?: boolean }
      >()
      if (options.run && options.client !== 'claude-code')
        throw new OperationError('--run は claude-code のみ対応しています', 2)
      const snippet = installSnippet(options.client)
      context.output.result({ client: options.client, snippet }, snippet, Boolean(options.json))
      if (options.run) {
        const config = await resolveConfig({
          ...context.deps,
          ...(options.token ? { token: options.token } : {}),
        })
        context.output.remember(config.token)
        await (context.deps.runMcpInstall ?? runInstall)(
          'claude',
          ['mcp', 'add', 'hanamii', '--', 'npx', '-y', 'hanamii', 'mcp'],
          {
            ...(context.deps.env ?? process.env),
            ...(config.token ? { HANAMII_TOKEN: config.token } : {}),
          },
        )
      }
    })
}
