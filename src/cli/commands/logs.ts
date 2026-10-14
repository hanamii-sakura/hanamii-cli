import type { Command } from 'commander'
import { fetchLogs, followLogs } from '../../core/logs.js'
import type { CliContext } from '../context.js'
import { integerOption, projectContext, type ProjectOptions } from '../project.js'

const logTime = (timestamp: string) => {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime())
    ? timestamp
    : new Intl.DateTimeFormat('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Tokyo',
      }).format(date)
}
export function registerLogs(program: Command, context: CliContext): void {
  program
    .command('logs')
    .description('実行ログを表示する')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
    .option('--since <time>', '取得開始（相対時間または ISO）', '-15m')
    .option('--limit <count>', '取得件数（最大500）', '100')
    .option('--before <ISO>', '指定時刻より前を取得する')
    .option('--follow', '3秒間隔で追跡する（--json は差分の logs 配列を1行ずつ出力）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        ProjectOptions & { since: string; limit: string; before?: string; follow?: boolean }
      >()
      const query = {
        since: options.since,
        limit: integerOption(options.limit, '--limit', 1, 500),
        ...(options.before ? { before: options.before } : {}),
      }
      if (!options.follow) {
        const { client, id } = await projectContext(context, options)
        if (options.json) context.output.result((await fetchLogs(client, id, query)).logs, '', true)
        else context.output.write(await client.getLogsText(id, query))
        return
      }
      const controller = new AbortController()
      const interrupt = () => controller.abort()
      process.on('SIGINT', interrupt)
      try {
        const { client, id } = await projectContext(context, options)
        await followLogs(client, id, query, {
          signal: controller.signal,
          onLogs: (logs) =>
            context.output.result(
              logs,
              logs.map((log) => `${logTime(log.timestamp)} ${log.message}`).join('\n'),
              Boolean(options.json),
            ),
        })
      } finally {
        process.removeListener('SIGINT', interrupt)
      }
    })
}
