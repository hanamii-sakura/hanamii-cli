import type { Command } from 'commander'
import { deploy, type DeployEvent } from '../../core/deploy.js'
import { parseEnvs } from '../../core/env.js'
import { OperationError } from '../../core/errors.js'
import type { CliContext, GlobalOptions } from '../context.js'

interface Options extends GlobalOptions {
  name?: string
  project?: string
  dir: string
  env: string[]
  git?: boolean
  wait: boolean
  timeout: string
  gitignore: boolean
}
function describe(event: DeployEvent): string | undefined {
  switch (event.type) {
    case 'precheck':
      return 'ローカル事前検証中'
    case 'zip':
      return `ZIP: ${event.fileCount} ファイル / ${event.bytes} bytes（symlink ${event.skipped.symlinks} 件スキップ）`
    case 'upload':
      return 'アップロード中'
    case 'check':
      return 'サーバー検証中'
    case 'deployment':
      return `project=${event.projectId} ${event.readyState ?? '待機中'}`
    case 'progress':
      return undefined
  }
}
export function registerDeploy(program: Command, context: CliContext): void {
  program
    .command('deploy')
    .description('ZIP または Git からデプロイする')
    .option('--name <name>', '新規プロジェクト名')
    .option('--project <id|name>', '再デプロイ先')
    .option('--dir <dir>', '対象ディレクトリ', '.')
    .option(
      '--env <K=V>',
      '環境変数（複数指定可、既定 secret）',
      (value: string, previous: string[]) => [...previous, value],
      [],
    )
    .option('--git', '既存 Git ソースで再デプロイ（新規は projects create）')
    .option('--no-wait', '開始後に完了を待たず終了する')
    .option('--timeout <seconds>', '完了待機の上限秒数（最大900）', '900')
    .option('--no-gitignore', '.gitignore を無視する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<Options>()
      const envs = parseEnvs(options.env)
      const timeoutMs = Number(options.timeout) * 1000
      if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 900_000)
        throw new OperationError('--timeout は 0 より大きく900秒以下で指定してください', 2)
      const { client } = await context.authenticated(options)
      const controller = new AbortController()
      const interrupt = () => controller.abort()
      process.on('SIGINT', interrupt)
      try {
        const result = await deploy(client, {
          dir: options.dir,
          envs,
          gitignore: options.gitignore,
          wait: options.wait,
          timeoutMs,
          signal: controller.signal,
          ...(options.name ? { name: options.name } : {}),
          ...(options.project ? { project: options.project } : {}),
          ...(options.workspace ? { workspaceId: options.workspace } : {}),
          ...(options.git ? { git: true } : {}),
          onEvent: (event) => {
            const message = describe(event)
            if (message && !options.json) context.output.error(`${message}\n`)
          },
        })
        if (result.exitCode !== 0)
          throw new OperationError(
            result.exitCode === 8
              ? `検証で問題が見つかりました:\n${result.check!.errors.map((e) => e.message).join('\n')}`
              : `デプロイ失敗: ${result.errorCode ?? 'unknown'}`,
            result.exitCode,
            result,
          )
        context.output.result(
          result,
          `${result.readyState === 'READY' ? '公開完了' : 'デプロイ開始'}: ${result.url ?? result.projectId}`,
          Boolean(options.json),
        )
      } finally {
        process.removeListener('SIGINT', interrupt)
      }
    })
}
