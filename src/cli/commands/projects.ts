import type { Command } from 'commander'
import { HanamiiApiError } from '../../api/errors.js'
import type { Project } from '../../api/types.js'
import type { HanamiiClient } from '../../api/client.js'
import { listAllProjects, resolveProject } from '../../core/project-resolve.js'
import { resolveWorkspace } from '../../core/workspace.js'
import { OperationError } from '../../core/errors.js'
import type { CliContext, GlobalOptions } from '../context.js'

export async function getSelectedProject(
  client: HanamiiClient,
  identifier: string,
  workspaceId?: string,
): Promise<Project> {
  const id = await resolveProject(client, {
    project: identifier,
    ...(workspaceId ? { workspaceId } : {}),
  })
  const { project } = await client.getProject(id)
  if (workspaceId && project.workspaceId !== workspaceId)
    throw new OperationError('プロジェクトと --workspace が一致しません', 2)
  return project
}
export function registerProjects(program: Command, context: CliContext): void {
  const projects = program.command('projects').description('プロジェクトを操作する')
  projects
    .command('list')
    .description('プロジェクト一覧を表示する')
    .option('--all', '全ページを取得する')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions & { all?: boolean }>()
      const { client } = await context.authenticated(options)
      const result = options.all
        ? { projects: await listAllProjects(client, options.workspace) }
        : await client.listProjects(options.workspace ? { workspaceId: options.workspace } : {})
      const next = 'pagination' in result ? result.pagination.next : null
      context.output.result(
        result,
        result.projects.length
          ? `${result.projects.map((p) => `${p.id}\t${p.name}\t${p.latestDeployment?.readyState ?? p.status}\t${p.url ?? ''}`).join('\n')}${next === null ? '' : '\n続きがあります。--all で全件表示できます。'}`
          : 'プロジェクトはありません。',
        Boolean(options.json),
      )
    })
  projects
    .command('get <id|name>')
    .description('プロジェクトの詳細を表示する')
    .action(async (identifier: string, _opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions>()
      const { client } = await context.authenticated(options)
      const project = await getSelectedProject(client, identifier, options.workspace)
      context.output.result(
        { project },
        `${project.id}\t${project.name}\nURL: ${project.url ?? '-'}\nデプロイ: ${project.latestDeployment?.readyState ?? '-'}\nランタイム: ${project.runtimeStatus.status}`,
        Boolean(options.json),
      )
    })
  projects
    .command('create')
    .description('Git リポジトリから新規作成し、初回デプロイを開始する')
    .requiredOption('--name <name>', 'プロジェクト名')
    .requiredOption('--git <owner/repo>', 'GitHub リポジトリ')
    .requiredOption('--ref <ref>', 'ブランチまたはref')
    .option('--root <directory>', 'リポジトリ内のルートディレクトリ')
    .action(async (_opts, command: Command) => {
      const options = command.optsWithGlobals<
        GlobalOptions & { name: string; git: string; ref: string; root?: string }
      >()
      if (!options.name.trim() || !options.ref.trim() || !/^[^/\s]+\/[^/\s]+$/.test(options.git))
        throw new OperationError('--name / --git owner/repo / --ref を指定してください', 2)
      const { client } = await context.authenticated(options)
      const workspaceId = await resolveWorkspace(client, options.workspace)
      try {
        const result = await client.createProject(
          {
            name: options.name,
            ...(workspaceId ? { workspaceId } : {}),
            source: {
              type: 'git',
              repoFullName: options.git,
              ref: options.ref,
              ...(options.root === undefined ? {} : { rootDirectory: options.root }),
            },
          },
          { retryRateLimit: false },
        )
        if (result.deployment.readyState === 'ERROR')
          throw new OperationError(
            `デプロイ失敗: ${result.deployment.errorCode ?? 'unknown'}`,
            10,
            result,
          )
        context.output.result(
          result,
          `プロジェクト作成: ${result.project.id}\t${result.project.name}\nデプロイ: ${result.deployment.readyState}`,
          Boolean(options.json),
        )
      } catch (error) {
        if (error instanceof HanamiiApiError && (error.status === 409 || error.code === 'conflict'))
          throw new OperationError(`${error.message}\n--project <name> で再デプロイできます`, 1)
        throw error
      }
    })
  projects
    .command('delete <id|name>')
    .description('名前を再入力してプロジェクトを削除する')
    .option('--yes', '名前の確認を省略する')
    .action(async (identifier: string, _opts, command: Command) => {
      const options = command.optsWithGlobals<GlobalOptions & { yes?: boolean }>()
      const { client } = await context.authenticated(options)
      const project = await getSelectedProject(client, identifier, options.workspace)
      if (!options.yes) {
        if (!context.isInteractive)
          throw new OperationError('非対話では --yes を指定してください', 2)
        const answer = await context.promptProjectName(project.name)
        if (answer !== project.name)
          throw new OperationError('名前が一致しないため削除を中止しました', 1)
      }
      const result = await client.deleteProject(project.id)
      context.output.result(
        result,
        result.project.deletion === 'accepted'
          ? `削除受付: ${project.id}\noperationId: ${result.project.operationId}${result.project.requiresReview ? '\nレビューが必要です。' : ''}`
          : `削除完了: ${project.id}`,
        Boolean(options.json),
      )
    })
}
