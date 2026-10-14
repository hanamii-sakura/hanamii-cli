import type { Command } from 'commander'
import { OperationError } from '../../core/errors.js'
import { resolveWorkspace } from '../../core/workspace.js'
import type { CliContext, GlobalOptions } from '../context.js'

function expiresAt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const days = value === '30d' ? 30 : value === '90d' ? 90 : undefined
  const result = days
    ? Date.now() + days * 86400000
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(`${value}T00:00:00Z`)
      : NaN
  if (
    !Number.isFinite(result) ||
    result <= Date.now() ||
    (!days && new Date(result).toISOString().slice(0, 10) !== value)
  )
    throw new OperationError(
      '--expires は 30d / 90d / 未来の YYYY-MM-DD（UTC）で指定してください',
      2,
    )
  return result
}
export function registerTokens(program: Command, context: CliContext): void {
  const tokens = program.command('tokens').description('API トークンを管理する')
  tokens.command('list').action(async (_opts, command: Command) => {
    const options = command.optsWithGlobals<GlobalOptions>()
    const { client } = await context.authenticated(options)
    const result = await client.listTokens()
    context.output.result(
      result,
      result.tokens
        .map(
          (t) =>
            `${t.id}\t${t.name}\t${t.scopeType}\t${t.scopeWorkspaceId ?? '-'}\t${t.expiresAt === null ? '無期限' : new Date(t.expiresAt).toISOString()}`,
        )
        .join('\n') + (result.pagination.next === null ? '' : '\n続きがあります。') ||
        'トークンはありません。',
      Boolean(options.json),
    )
  })
  tokens
    .command('create')
    .requiredOption('--name <name>', 'トークン名')
    .requiredOption('--scope <scope>', 'full_account または workspace')
    .option('--expires <expires>', '30d / 90d / YYYY-MM-DD（UTC 00:00、省略時は無期限）')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        GlobalOptions & { name: string; scope: string; expires?: string }
      >()
      if (!options.name.trim() || !['full_account', 'workspace'].includes(options.scope))
        throw new OperationError('--name と --scope full_account|workspace を指定してください', 2)
      const expiry = expiresAt(options.expires)
      const { client } = await context.authenticated(options)
      let workspace = options.workspace
      if (options.scope === 'workspace' && !workspace) {
        workspace = await resolveWorkspace(client)
        if (!workspace)
          workspace = (await client.getCurrentToken()).token.scopeWorkspaceId ?? undefined
        if (!workspace) throw new OperationError('--workspace を指定してください', 2)
      }
      const result = await client.createToken(
        {
          name: options.name,
          scopeType: options.scope as 'workspace' | 'full_account',
          ...(options.scope === 'workspace' ? { scopeWorkspaceId: workspace! } : {}),
          ...(expiry === undefined ? {} : { expiresAt: expiry }),
        },
        { retryRateLimit: false },
      )
      context.output.createdToken(result.token, result.bearerToken, Boolean(options.json))
    })
  tokens.command('revoke <id>').action(async (id: string, _opts, command: Command) => {
    const options = command.optsWithGlobals<GlobalOptions>()
    const { client } = await context.authenticated(options)
    const result = await client.revokeToken(id)
    context.output.result(
      result,
      `トークンを失効しました: ${result.token.id}`,
      Boolean(options.json),
    )
  })
}
