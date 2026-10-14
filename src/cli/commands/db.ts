import type { Command } from 'commander'
import type { Cell, RowsPage } from '../../api/types.js'
import type { CliContext } from '../context.js'
import { integerOption, projectContext, type ProjectOptions } from '../project.js'

function cell(value: Cell | undefined): string {
  if (value === undefined) return ''
  if (value === null) return 'NULL'
  if (typeof value === 'object')
    return value.kind === 'blob'
      ? `[BLOB: ${value.bytes} bytes]`
      : `${cell(value.value)}（省略あり）`
  return String(value).replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n')
}
function rowsTable(result: RowsPage): string {
  const columns = [...new Set(result.rows.flatMap((row) => Object.keys(row)))]
  const table = result.rows.length
    ? [
        columns.map(cell).join('\t'),
        ...result.rows.map((row) => columns.map((column) => cell(row[column])).join('\t')),
      ].join('\n')
    : '行はありません。'
  const page = result.pagination
  return `${table}\nlimit: ${page.limit ?? '-'}\toffset: ${page.offset ?? '-'}\t総件数: ${page.totalCount ?? '-'}${page.totalCountTruncated ? '（集計上限あり）' : ''}`
}
export function registerDb(program: Command, context: CliContext): void {
  const db = program
    .command('db')
    .description('データベースを参照する（読取専用）')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
  db.command('info')
    .description('データベース情報を表示する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions>()
      const { client, id } = await projectContext(context, options)
      const result = await client.getDatabase(id)
      const database = result.database
      context.output.result(
        result,
        database
          ? `${database.id}\t${database.name}\t${database.status}\nホスト: ${database.hostname ?? '-'}\nslug: ${database.slug}${database.failureReason ? `\nエラー: ${database.failureReason}` : ''}`
          : 'データベースはありません',
        Boolean(options.json),
      )
    })
  db.command('tables')
    .description('テーブルと列定義を表示する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions>()
      const { client, id } = await projectContext(context, options)
      const result = await client.listDatabaseTables(id)
      context.output.result(
        result,
        result.tables
          .map(
            (table) =>
              `${table.name}\t${table.columns.map((column) => `${column.name} ${column.type}${column.isPrimaryKey ? ' PRIMARY KEY' : ''}${column.isNotNull ? ' NOT NULL' : ''}`).join(', ')}`,
          )
          .join('\n') || 'テーブルはありません。',
        Boolean(options.json),
      )
    })
  db.command('rows <table>')
    .description('指定テーブルの行を表示する')
    .option('--limit <count>', '取得件数（1〜100）', '50')
    .option('--offset <count>', '開始位置（0〜1000000）', '0')
    .action(async (table: string, _opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions & { limit: string; offset: string }>()
      const query = {
        limit: integerOption(options.limit, '--limit', 1, 100),
        offset: integerOption(options.offset, '--offset', 0, 1000000),
      }
      const { client, id } = await projectContext(context, options)
      const result = await client.getDatabaseRows(id, table, query)
      context.output.result(result, rowsTable(result), Boolean(options.json))
    })
}
