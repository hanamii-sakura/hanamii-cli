import type { Command } from 'commander'
import type { HealthCheck, HealthCheckInput } from '../../api/types.js'
import { OperationError } from '../../core/errors.js'
import type { CliContext } from '../context.js'
import { integerOption, projectContext, type ProjectOptions } from '../project.js'

const describe = (health: HealthCheck) =>
  `状態: ${health.enabled ? '有効' : '無効'}\nパス: ${health.path ?? '-'}\nポート: ${health.port ?? '-'}`
export function registerHealthCheck(program: Command, context: CliContext): void {
  const health = program
    .command('health-check')
    .description('ヘルスチェック設定を取得・保存する')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
  health.command('get').action(async (_opts, command: Command) => {
    const options = command.optsWithGlobals<ProjectOptions>()
    const { client, id } = await projectContext(context, options)
    const result = await client.getHealthCheck(id)
    context.output.result(result, describe(result.healthCheck), Boolean(options.json))
  })
  health
    .command('set')
    .description('設定を保存する（反映には restart または再デプロイが必要）')
    .option('--path <path>', 'チェックするパス')
    .option('--port <port>', 'ポート番号')
    .option('--disable', '無効にする')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        ProjectOptions & { path?: string; port?: string; disable?: boolean }
      >()
      if (
        options.disable
          ? options.path !== undefined || options.port !== undefined
          : !options.path?.startsWith('/')
      )
        throw new OperationError('--path /health [--port N] または --disable を指定してください', 2)
      const body: HealthCheckInput = options.disable
        ? { enabled: false }
        : {
            enabled: true,
            path: options.path!,
            ...(options.port === undefined
              ? {}
              : { port: integerOption(options.port, '--port', 1, 65535) }),
          }
      const { client, id } = await projectContext(context, options)
      const result = await client.setHealthCheck(id, body)
      context.output.result(
        result,
        `保存しました。反映には restart または再デプロイが必要です。\n${describe(result.healthCheck)}`,
        Boolean(options.json),
      )
    })
}
