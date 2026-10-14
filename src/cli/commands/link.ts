import type { Command } from 'commander'
import { removeProjectLink, writeProjectLink } from '../../config/project-link.js'
import { getSelectedProject } from './projects.js'
import type { CliContext, GlobalOptions } from '../context.js'

export function registerLink(program: Command, context: CliContext): void {
  program
    .command('link <id|name>')
    .description('カレントディレクトリをプロジェクトに紐づける')
    .action(async (identifier: string, _opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      const { client } = await context.authenticated(options)
      const project = await getSelectedProject(client, identifier, options.workspace)
      const link = { projectId: project.id, name: project.name, workspaceId: project.workspaceId }
      await writeProjectLink(context.deps.cwd ?? process.cwd(), link)
      context.output.result(
        link,
        `リンクしました: ${project.id}\t${project.name}`,
        Boolean(options.json),
      )
    })
  program
    .command('unlink')
    .description('カレントディレクトリのプロジェクトリンクを解除する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      await removeProjectLink(context.deps.cwd ?? process.cwd())
      context.output.result(
        { linked: false },
        'プロジェクトリンクを解除しました。',
        Boolean(options.json),
      )
    })
}
