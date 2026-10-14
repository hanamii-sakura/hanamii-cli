import { setTimeout as sleep } from 'node:timers/promises'
import type { HanamiiClient } from '../api/client.js'
import type { Project } from '../api/types.js'
import { OperationError } from './errors.js'

export interface PollOptions {
  timeoutMs?: number
  intervalMs?: number
  signal?: AbortSignal
  deploymentId?: string
  onTick?: (project: Project) => void
}
export async function waitForDeployment(
  client: HanamiiClient,
  projectId: string,
  options: PollOptions = {},
): Promise<Project> {
  const timeoutMs = options.timeoutMs ?? 900_000
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 900_000)
    throw new OperationError('timeout は 1〜900000 ミリ秒で指定してください', 2)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal
  try {
    for (;;) {
      signal.throwIfAborted()
      const { project } = await client.getProject(projectId, { signal })
      options.onTick?.(project)
      const deployment = project.latestDeployment
      // 以前の READY を新しいデプロイの成功と誤認しない。
      if (
        (!options.deploymentId || deployment?.id === options.deploymentId) &&
        (deployment?.readyState === 'READY' || deployment?.readyState === 'ERROR')
      )
        return project
      await sleep(options.intervalMs ?? 10_000, undefined, { signal })
    }
  } catch (error) {
    if (options.signal?.aborted)
      throw new OperationError(
        `待機を中断しました。デプロイ自体は継続しています。project=${projectId}`,
        1,
        { projectId },
      )
    if (controller.signal.aborted)
      throw new OperationError(`デプロイ待機がタイムアウトしました。project=${projectId}`, 11, {
        projectId,
      })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
