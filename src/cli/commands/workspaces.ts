import type { Command } from 'commander'
import type { CliContext, GlobalOptions } from '../context.js'

export function registerWorkspaces(program: Command, context: CliContext): void {
  program
    .command('workspaces')
    .description('ワークスペースを操作する')
    .command('list')
    .description('アクセス可能なワークスペースを一覧表示する')
    .action(async (_options, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      const { client } = await context.authenticated(options)
      const { workspaces } = await client.listWorkspaces()
      context.output.result(
        { workspaces },
        workspaces.length
          ? workspaces
              .map((workspace) => `${workspace.id}\t${workspace.name}\t${workspace.role}`)
              .join('\n')
          : 'ワークスペースはありません。',
        Boolean(options.json),
      )
    })
}
