import type { HanamiiClient } from '../api/client.js'
import type { DeployResponse } from '../api/types.js'
import type { DeployResult } from './deploy.js'
import { waitForDeployment } from './poll.js'

/** Git デプロイはローカルファイルやリンクを書き換えない。 */
export async function finishGitDeployment(
  client: HanamiiClient,
  result: DeployResponse,
  wait: boolean,
  timeoutSec: number,
  signal?: AbortSignal,
): Promise<DeployResult> {
  if (wait && result.deployment.readyState !== 'ERROR') {
    const project = await waitForDeployment(client, result.project.id, {
      deploymentId: result.deployment.id,
      timeoutMs: timeoutSec * 1000,
      ...(signal ? { signal } : {}),
    })
    return {
      exitCode: project.latestDeployment?.readyState === 'ERROR' ? 10 : 0,
      projectId: project.id,
      url: project.url,
      readyState: project.latestDeployment!.readyState,
      errorCode: project.latestDeployment!.errorCode,
    }
  }
  return {
    exitCode: result.deployment.readyState === 'ERROR' ? 10 : 0,
    projectId: result.project.id,
    readyState: result.deployment.readyState,
    errorCode: result.deployment.errorCode,
  }
}
