import type { HanamiiClient } from '../api/client.js'
import { HanamiiApiError, redact } from '../api/errors.js'
import type { CheckResult, DeployInput, EnvInput } from '../api/types.js'
import { putZip } from '../api/upload-put.js'
import { writeProjectLink } from '../config/project-link.js'
import { buildZip } from '../zip/build.js'
import { precheck } from '../zip/precheck.js'
import { walk } from '../zip/walk.js'
import { OperationError } from './errors.js'
import { waitForDeployment } from './poll.js'
import { resolveProject } from './project-resolve.js'
import { resolveWorkspace } from './workspace.js'

export type DeployEvent =
  | { type: 'precheck' | 'upload' | 'check' }
  | { type: 'zip'; fileCount: number; bytes: number; skipped: { symlinks: number } }
  | { type: 'progress'; sent: number; total: number }
  | { type: 'deployment'; projectId: string; readyState: string | null }
export interface DeployOptions {
  dir: string
  name?: string
  project?: string
  workspaceId?: string
  envs?: EnvInput[]
  git?: boolean
  gitignore?: boolean
  wait?: boolean
  timeoutMs?: number
  pollIntervalMs?: number
  /** 中断はポーリングだけに適用。開始済みデプロイを取り消さない。 */
  signal?: AbortSignal
  onEvent?: (event: DeployEvent) => void
}
export interface DeployResult {
  exitCode: 0 | 8 | 10
  projectId?: string
  url?: string | null
  readyState?: string
  errorCode?: string | null
  check?: { errors: CheckResult['errors'] }
}
export async function deploy(client: HanamiiClient, options: DeployOptions): Promise<DeployResult> {
  if (options.name && options.project)
    throw new OperationError('--name と --project は同時に指定できません', 2)
  if (options.git && options.name)
    throw new OperationError('Git の新規作成は projects create --git を使用してください', 2)
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 900_000)
  )
    throw new OperationError('--timeout は 0 より大きく900秒以下で指定してください', 2)
  const notify = (event: DeployEvent) => options.onEvent?.(event)
  let zip: Awaited<ReturnType<typeof buildZip>> | undefined
  try {
    const projectId = options.name
      ? undefined
      : await resolveProject(client, {
          dir: options.dir,
          ...(options.project ? { project: options.project } : {}),
          ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        })
    let workspaceId = options.workspaceId
    if (projectId) {
      const { project } = await client.getProject(projectId)
      if (workspaceId && workspaceId !== project.workspaceId)
        throw new OperationError('プロジェクトと --workspace が一致しません', 2)
      workspaceId = workspaceId ?? project.workspaceId
    } else workspaceId = await resolveWorkspace(client, workspaceId)
    let source: DeployInput['source']
    if (options.git) source = { type: 'git' }
    else {
      notify({ type: 'precheck' })
      const listing = await walk(options.dir, {
        ...(options.gitignore === undefined ? {} : { gitignore: options.gitignore }),
      })
      await precheck(listing.dir, listing)
      zip = await buildZip(listing.dir, {}, listing)
      notify({ type: 'zip', fileCount: zip.fileCount, bytes: zip.bytes, skipped: zip.skipped })
      const { upload } = await client.createUpload({
        ...(workspaceId ? { workspaceId } : {}),
        fileName: 'app.zip',
        contentType: 'application/zip',
      })
      notify({ type: 'upload' })
      await putZip(upload.uploadUrl, zip.zipPath, (sent, total) =>
        notify({ type: 'progress', sent, total }),
      )
      notify({ type: 'check' })
      const { result } = await client.checkUpload(upload.id)
      if (!result.canDeploy)
        return {
          exitCode: 8,
          check: {
            errors: JSON.parse(redact(JSON.stringify(result.errors))) as CheckResult['errors'],
          },
        }
      if (!result.checkId) throw new Error('checkId がAPI応答にありません')
      source = { type: 'zip', checkId: result.checkId }
    }
    const envs = options.envs?.map((env) => ({ ...env, type: env.type ?? ('secret' as const) }))
    if (projectId && envs?.length) await client.setEnv(projectId, envs)
    const response = projectId
      ? await client.deployProject(projectId, { source }, { retryRateLimit: false })
      : await client.createProject(
          {
            name: options.name!,
            source: source as { type: 'zip'; checkId: string },
            ...(workspaceId ? { workspaceId } : {}),
            ...(envs?.length ? { envs } : {}),
          },
          { retryRateLimit: false },
        )
    notify({
      type: 'deployment',
      projectId: response.project.id,
      readyState: response.deployment.readyState,
    })
    let result: DeployResult = {
      exitCode: response.deployment.readyState === 'ERROR' ? 10 : 0,
      projectId: response.project.id,
      readyState: response.deployment.readyState,
      errorCode: response.deployment.errorCode,
      url: null,
    }
    if (options.wait !== false) {
      const project = await waitForDeployment(client, response.project.id, {
        deploymentId: response.deployment.id,
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        ...(options.pollIntervalMs === undefined ? {} : { intervalMs: options.pollIntervalMs }),
        ...(options.signal ? { signal: options.signal } : {}),
        onTick: (p) =>
          notify({
            type: 'deployment',
            projectId: p.id,
            readyState: p.latestDeployment?.readyState ?? null,
          }),
      })
      result = {
        exitCode: project.latestDeployment!.readyState === 'ERROR' ? 10 : 0,
        projectId: project.id,
        url: project.url,
        readyState: project.latestDeployment!.readyState,
        errorCode: project.latestDeployment!.errorCode,
      }
    }
    if (result.exitCode === 0)
      await writeProjectLink(options.dir, {
        projectId: response.project.id,
        name: response.project.name,
        workspaceId: response.project.workspaceId,
      })
    return result
  } catch (error) {
    if (error instanceof HanamiiApiError && (error.status === 409 || error.code === 'conflict'))
      throw new OperationError(`${error.message}\n--project <name> で再デプロイできます`, 1)
    throw error
  } finally {
    await zip?.cleanup()
  }
}
