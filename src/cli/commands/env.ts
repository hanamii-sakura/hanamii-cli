import type { Command } from 'commander'
import { parseEnvs } from '../../core/env.js'
import type { CliContext } from '../context.js'
import { projectContext, type ProjectOptions } from '../project.js'
import { describeRestart } from './restart.js'

export function registerEnv(program: Command, context: CliContext): void {
  const env = program
    .command('env')
    .description('環境変数を操作する（unset は削除 API がないため提供しません）')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
  env
    .command('list')
    .description('key / type を表示する')
    .option('--decrypt', '値も表示する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions & { decrypt?: boolean }>()
      const { client, id } = await projectContext(context, options)
      const result = await client.getEnv(id, { decrypt: Boolean(options.decrypt) })
      const envs = result.envs.map((e) => ({
        key: e.key,
        type: e.type,
        ...(options.decrypt ? { value: e.value } : {}),
      }))
      context.output.result(
        { envs },
        envs
          .map((e) => `${e.key}\t${e.type}${options.decrypt ? `\t${e.value ?? ''}` : ''}`)
          .join('\n') || '環境変数はありません。',
        Boolean(options.json),
      )
    })
  env
    .command('set <K=V...>')
    .description('環境変数を保存する（既定 secret）')
    .option('--plain', 'plain として保存する')
    .option('--restart', '保存後に再起動する')
    .action(async (values: string[], _opts, command: Command) => {
      const options = command.optsWithGlobals<
        ProjectOptions & { plain?: boolean; restart?: boolean }
      >()
      const envs = parseEnvs(values).map((e) => ({
        ...e,
        type: options.plain ? ('plain' as const) : ('secret' as const),
      }))
      const { client, id } = await projectContext(context, options)
      const saved = await client.setEnv(id, envs)
      const restart = options.restart ? await client.restartProject(id) : undefined
      const result = {
        envs: saved.envs.map((e) => ({ key: e.key, type: e.type })),
        ...(restart ? { restart } : {}),
      }
      context.output.result(
        result,
        `環境変数を保存しました。\n${result.envs.map((e) => `${e.key}\t${e.type}`).join('\n')}${restart ? `\n${describeRestart(restart)}` : ''}`,
        Boolean(options.json),
      )
    })
}
