import type { Command } from 'commander'
import type { RestartResponse } from '../../api/types.js'
import type { CliContext } from '../context.js'
import { projectContext, type ProjectOptions } from '../project.js'

export function describeRestart(result: RestartResponse): string {
  return 'noop' in result && result.noop
    ? `再起動不要: ${result.message}`
    : `再起動開始: ${result.project.id}\t${result.deployment?.readyState ?? ''}`
}
export function registerRestart(program: Command, context: CliContext): void {
  program
    .command('restart')
    .description('プロジェクトを再起動する')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions>()
      const { client, id } = await projectContext(context, options)
      const result = await client.restartProject(id)
      context.output.result(result, describeRestart(result), Boolean(options.json))
    })
}
