import type { Command } from 'commander'
import { requireWorkspace, resolveBucket } from '../../core/storage.js'
import { OperationError } from '../../core/errors.js'
import type { CliContext, GlobalOptions } from '../context.js'

type Options = GlobalOptions & { cursor?: string; yes?: boolean }
export function registerStorage(program: Command, context: CliContext): void {
  const storage = program.command('storage').description('オブジェクトストレージを管理する（beta）')
  const buckets = storage.command('buckets').description('バケットを管理する')
  const keys = storage.command('keys').description('アクセスキーを管理する')
  const files = storage.command('files').description('ファイル一覧・閲覧 URL を取得する')
  async function workspace(command: Command) {
    const options = command.optsWithGlobals<Options>()
    const { client } = await context.authenticated(options)
    return { options, client, workspaceId: await requireWorkspace(client, options.workspace) }
  }
  async function selected(command: Command, identifier: string) {
    const ctx = await workspace(command)
    return { ...ctx, ...(await resolveBucket(ctx.client, ctx.workspaceId, identifier)) }
  }
  function show(data: unknown, options: Options) {
    context.output.result(data, JSON.stringify(data, null, 2), Boolean(options.json))
  }
  buckets
    .command('list')
    .option('--cursor <cursor>', '次ページのカーソル')
    .action(async (_opts, command: Command) => {
      const { client, workspaceId, options } = await workspace(command)
      show(await client.listStorageBuckets(workspaceId, options.cursor), options)
    })
  buckets
    .command('create <name>')
    .requiredOption('--visibility <visibility>', 'public または private（作成後変更不可）')
    .action(async (name: string, _opts, command: Command) => {
      const { visibility } = command.opts<{ visibility: string }>()
      if (
        !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(name) ||
        !['public', 'private'].includes(visibility)
      )
        throw new OperationError(
          '名前は英小文字・数字・ハイフンの3〜63文字、visibility は public|private を指定してください',
          2,
        )
      const { client, workspaceId, options } = await workspace(command)
      show(
        await client.createStorageBucket(
          workspaceId,
          { name, visibility: visibility as 'public' | 'private' },
          { retryRateLimit: false },
        ),
        options,
      )
    })
  buckets
    .command('delete <bucket>')
    .option('--yes', '名前の確認を省略する')
    .action(async (identifier: string, _opts, command: Command) => {
      const { client, workspaceId, bucket, options } = await selected(command, identifier)
      if (!options.yes) {
        if (!context.isInteractive)
          throw new OperationError('非対話では --yes を指定してください', 2)
        if ((await context.promptProjectName(bucket.name)) !== bucket.name)
          throw new OperationError('名前が一致しないため削除を中止しました', 1)
      }
      const result = await client.deleteStorageBucket(workspaceId, bucket.id)
      show(
        { bucketId: bucket.id, name: bucket.name, status: result.status ?? 'completed' },
        options,
      )
    })
  keys
    .command('list <bucket>')
    .option('--cursor <cursor>', '次ページのカーソル')
    .action(async (identifier: string, _opts, command: Command) => {
      const { client, workspaceId, bucket, options } = await selected(command, identifier)
      show(await client.listStorageAccessKeys(workspaceId, bucket.id, options.cursor), options)
    })
  keys
    .command('create <bucket>')
    .requiredOption('--permission <permission>', 'read_only または read_write')
    .action(async (identifier: string, _opts, command: Command) => {
      const { permission } = command.opts<{ permission: string }>()
      if (!['read_only', 'read_write'].includes(permission))
        throw new OperationError('--permission read_only|read_write を指定してください', 2)
      const { client, workspaceId, bucket, apiOrigin, options } = await selected(
        command,
        identifier,
      )
      const { key, ...metadata } = await client.createStorageAccessKey(
        workspaceId,
        bucket.id,
        permission as 'read_only' | 'read_write',
        { retryRateLimit: false },
      )
      context.output.createdSecret(
        { ...metadata, bucketId: bucket.id, apiOrigin },
        'key',
        key,
        Boolean(options.json),
      )
    })
  keys
    .command('revoke <bucket> <keyId>')
    .action(async (identifier: string, keyId: string, _opts, command: Command) => {
      if (!/^key_[A-Za-z0-9_-]{24}$/.test(keyId))
        throw new OperationError('キー ID を指定してください', 2)
      const { client, workspaceId, bucket, options } = await selected(command, identifier)
      await client.revokeStorageAccessKey(workspaceId, bucket.id, keyId)
      show({ bucketId: bucket.id, keyId, revoked: true }, options)
    })
  files
    .command('list <bucket>')
    .option('--cursor <cursor>', '次ページのカーソル')
    .action(async (identifier: string, _opts, command: Command) => {
      const { client, workspaceId, bucket, options } = await selected(command, identifier)
      show(await client.listStorageFiles(workspaceId, bucket.id, options.cursor), options)
    })
  files
    .command('url <bucket> <fileId>')
    .description('閲覧 URL を発行する（非公開は1時間有効）')
    .action(async (identifier: string, fileId: string, _opts, command: Command) => {
      if (!/^[A-Za-z0-9_-]+$/.test(fileId))
        throw new OperationError('ファイル ID を指定してください', 2)
      const { client, workspaceId, bucket, options } = await selected(command, identifier)
      show(await client.createStorageFileViewUrl(workspaceId, bucket.id, fileId), options)
    })
  storage.command('usage').action(async (_opts, command: Command) => {
    const { client, workspaceId, options } = await workspace(command)
    show(await client.getStorageUsage(workspaceId), options)
  })
}
