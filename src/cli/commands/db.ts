import { resolve } from 'node:path'
import { importDatabase, requiredValue } from '../../core/database.js'
import { waitDatabaseExport, saveDatabaseExport } from '../../core/database-export.js'
import { OperationError } from '../../core/errors.js'
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
    .description('データベースを管理する（beta）')
    .option('--project <id|name>', '対象プロジェクト（省略時はリンク先）')
  const show = (result: unknown, json?: boolean) =>
    context.output.result(result, JSON.stringify(result, null, 2), Boolean(json))
  db.command('create')
    .option('--name <name>', 'DB の表示名（100文字まで）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions & { name?: string }>()
      validateName(options.name)
      const { client, id } = await projectContext(context, options)
      const result = await client.createDatabase(
        id,
        options.name === undefined ? {} : { name: options.name },
        { retryRateLimit: false },
      )
      requiredValue(result.database, '作成後のデータベース')
      show(result, options.json)
    })
  db.command('delete')
    .option('--yes', 'DB名の再入力を省略する（非対話では必須）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions & { yes?: boolean }>()
      const { client, id } = await projectContext(context, options)
      const database = requiredValue(
        (await client.getDatabase(id)).database,
        '削除対象のデータベース',
      )
      if (!options.yes) {
        if (!context.isInteractive)
          throw new OperationError('非対話では --yes を指定してください', 2)
        if ((await context.promptProjectName(database.name)) !== database.name)
          throw new OperationError('名前が一致しないため削除を中止しました', 1)
      }
      show(await client.deleteDatabase(id), options.json)
    })
  const tokens = db.command('tokens').description('DB 接続トークンを管理する')
  tokens.command('list').action(async (_opts, command: Command) => {
    const options = command.optsWithGlobals<ProjectOptions>()
    const { client, id } = await projectContext(context, options)
    show(await client.listDatabaseTokens(id), options.json)
  })
  tokens
    .command('create')
    .option('--name <name>', 'トークン名（100文字まで）')
    .option('--permission <permission>', 'read_only または read_write', 'read_write')
    .option('--ttl <seconds>', '有効期間（秒）', '2592000')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        ProjectOptions & { name?: string; permission: string; ttl: string }
      >()
      validateName(options.name)
      if (!['read_only', 'read_write'].includes(options.permission))
        throw new OperationError('--permission read_only|read_write を指定してください', 2)
      const ttlSeconds = integerOption(options.ttl, '--ttl', 1, Number.MAX_SAFE_INTEGER)
      const { client, id } = await projectContext(context, options)
      const result = await client.createDatabaseToken(
        id,
        {
          ...(options.name === undefined ? {} : { name: options.name }),
          permission: options.permission as 'read_only' | 'read_write',
          ttlSeconds,
        },
        { retryRateLimit: false },
      )
      const token = requiredValue(result.token, '発行した DB 接続トークン')
      const databaseUrl = requiredValue(result.databaseUrl, 'DB 接続 URL')
      context.output.createdSecret(
        { authToken: result.authToken, databaseUrl },
        'token',
        token,
        Boolean(options.json),
      )
    })
  tokens.command('revoke <tokenId>').action(async (tokenId: string, _opts, command: Command) => {
    const options = command.optsWithGlobals<ProjectOptions>()
    const { client, id } = await projectContext(context, options)
    show(await client.revokeDatabaseToken(id, tokenId), options.json)
  })
  db.command('export')
    .description('DBをエクスポートする。既定は完了待機後に署名URLを表示')
    .option('--job <id>', '既存のエクスポートジョブを再開する')
    .option('--idempotency-key <key>', '再送時に同じジョブを使うキー')
    .option('--no-wait', '受付・状態取得だけで終了する')
    .option('--timeout <seconds>', '待機時間（秒、1〜900）', '900')
    .option('--output <file>', '完了後にファイルへ保存する（上書き不可）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        ProjectOptions & {
          job?: string
          idempotencyKey?: string
          wait: boolean
          timeout: string
          output?: string
        }
      >()
      if (!options.wait && options.output)
        throw new OperationError('--output と --no-wait は併用できません', 2)
      if (options.job && options.idempotencyKey)
        throw new OperationError('--job と --idempotency-key は併用できません', 2)
      const timeout = integerOption(options.timeout, '--timeout', 1, 900)
      const { client, id } = await projectContext(context, options)
      const result = options.job
        ? await client.getDatabaseExport(id, options.job)
        : await client.createDatabaseExport(
            id,
            options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey },
            { retryRateLimit: false },
          )
      const job = requiredValue(result.exportJob, 'エクスポートジョブ')
      if (!options.wait) {
        show(result, options.json)
        return
      }
      const exportJob = await waitDatabaseExport(client, id, job, timeout * 1000)
      const download = requiredValue(
        (await client.createDatabaseDownload(id, job.id)).download,
        'エクスポートのダウンロード情報',
      )
      if (options.output) {
        const file = resolve(context.deps.cwd ?? process.cwd(), options.output)
        await saveDatabaseExport(download, file, context.deps.fetch)
        show(
          { exportJob, file, sizeBytes: download.sizeBytes, sha256: download.sha256 },
          options.json,
        )
      } else show({ exportJob, download }, options.json)
    })
  db.command('import <file>')
    .description('SQLiteファイルからDBを作成する（既存DBへの上書き不可、100MiB以下）')
    .option('--name <name>', 'DB の表示名（100文字まで）')
    .action(async (file: string, _opts, command: Command) => {
      const options = command.optsWithGlobals<ProjectOptions & { name?: string }>()
      validateName(options.name)
      const { client, id } = await projectContext(context, options)
      show(
        await importDatabase(
          client,
          id,
          resolve(context.deps.cwd ?? process.cwd(), file),
          options.name,
          context.deps.fetch,
        ),
        options.json,
      )
    })
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

function validateName(name?: string) {
  if (name !== undefined && name.length > 100)
    throw new OperationError('名前は100文字以下で指定してください', 2)
}
